"""
EPSS Client — Exploit Prediction Scoring System by FIRST.org.

Fetches daily exploitation probability scores for CVE IDs.
API: https://api.first.org/data/v1/epss
Supports batch queries (comma-separated CVE IDs).
"""

import httpx

_EPSS_API = "https://api.first.org/data/v1/epss"
_BATCH_SIZE = 100  # max CVEs per request (conservative)


def collect_cve_ids(packages: list[dict]) -> list[str]:
    """Collect all unique CVE IDs from all packages for batch EPSS lookup."""
    cve_ids: set[str] = set()
    for pkg in packages:
        for vuln in pkg.get("vulnerabilities", []):
            vuln_id = vuln.get("id", "")
            if vuln_id.startswith("CVE-"):
                cve_ids.add(vuln_id)
    return list(cve_ids)



async def fetch_epss_scores(cve_ids: list[str]) -> dict[str, dict]:
    """
    Batch fetch EPSS scores for a list of CVE IDs.

    Returns dict keyed by CVE ID:
        {
            "CVE-2021-44228": {"epss": 0.9436, "percentile": 0.9996, "date": "2026-05-30"},
            ...
        }

    CVE IDs not found in EPSS are omitted from the result.
    """
    if not cve_ids:
        return {}

    # Deduplicate
    unique_ids = list(set(cve_ids))
    results: dict[str, dict] = {}

    # Chunk into batches
    for i in range(0, len(unique_ids), _BATCH_SIZE):
        batch = unique_ids[i : i + _BATCH_SIZE]
        batch_str = ",".join(batch)

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(_EPSS_API, params={"cve": batch_str})
                if resp.status_code != 200:
                    print(f"[EPSS] API returned {resp.status_code}")
                    continue

                body = resp.json()
                for entry in body.get("data", []):
                    cve_id = entry.get("cve", "")
                    try:
                        results[cve_id] = {
                            "epss": float(entry.get("epss", 0)),
                            "percentile": float(entry.get("percentile", 0)),
                            "date": entry.get("date", ""),
                        }
                    except (ValueError, TypeError):
                        continue

        except httpx.TimeoutException:
            print(f"[EPSS] Timeout fetching batch starting at index {i}")
        except Exception as e:
            print(f"[EPSS] Error: {e}")

    return results


def _extract_cve_id(vuln: dict) -> str | None:
    vuln_id = vuln.get("id", "")
    if isinstance(vuln_id, str) and vuln_id.startswith("CVE-"):
        return vuln_id

    aliases = vuln.get("aliases")
    if isinstance(aliases, str):
        parts = [a.strip() for a in aliases.split(",") if a.strip()]
    elif isinstance(aliases, list):
        parts = [str(a).strip() for a in aliases if str(a).strip()]
    else:
        parts = []

    for alias in parts:
        if alias.startswith("CVE-"):
            return alias

    return None


def collect_cve_ids(packages: list[dict]) -> list[str]:
    cve_ids: list[str] = []
    for pkg in packages:
        for vuln in pkg.get("vulnerabilities", []):
            cve_id = _extract_cve_id(vuln)
            if cve_id:
                cve_ids.append(cve_id)
                vuln.setdefault("cve_id", cve_id)
    return cve_ids


def enrich_vulnerabilities_with_epss(
    packages: list[dict], epss_scores: dict[str, dict]
) -> None:
    """
    Mutate each package's vulnerability entries in-place to add EPSS data.
    Also sets package-level epss_max_score (highest EPSS across all vulns).
    """
    for pkg in packages:
        max_epss = 0.0
        for vuln in pkg.get("vulnerabilities", []):
            vuln_id = vuln.get("cve_id") or _extract_cve_id(vuln) or vuln.get("id", "")
            epss_data = epss_scores.get(vuln_id)
            if epss_data:
                vuln["epss_score"] = epss_data["epss"]
                vuln["epss_percentile"] = epss_data["percentile"]
                max_epss = max(max_epss, epss_data["epss"])
            else:
                vuln["epss_score"] = None
                vuln["epss_percentile"] = None

        pkg["epss_max_score"] = max_epss if max_epss > 0 else None
