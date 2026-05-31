"""
KEV Client — CISA Known Exploited Vulnerabilities catalog.

Downloads the full KEV feed once and caches it in memory for 24 hours.
Provides O(1) lookup by CVE ID.

API: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
"""

import time
import httpx

_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_CACHE_TTL = 86400  # 24 hours

# Module-level cache
_kev_set: set[str] = set()
_kev_details: dict[str, dict] = {}
_kev_last_fetch: float = 0


async def _ensure_loaded() -> None:
    """Download KEV catalog if not cached or stale."""
    global _kev_set, _kev_details, _kev_last_fetch

    if _kev_set and (time.time() - _kev_last_fetch) < _CACHE_TTL:
        return  # Cache is fresh

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_KEV_URL)
            if resp.status_code != 200:
                print(f"[KEV] API returned {resp.status_code}")
                return

            body = resp.json()
            vulns = body.get("vulnerabilities", [])

            new_set: set[str] = set()
            new_details: dict[str, dict] = {}

            for v in vulns:
                cve_id = v.get("cveID", "")
                if cve_id:
                    new_set.add(cve_id)
                    new_details[cve_id] = {
                        "vendor": v.get("vendorProject", ""),
                        "product": v.get("product", ""),
                        "vulnerability_name": v.get("vulnerabilityName", ""),
                        "date_added": v.get("dateAdded", ""),
                        "short_description": v.get("shortDescription", ""),
                        "required_action": v.get("requiredAction", ""),
                        "due_date": v.get("dueDate", ""),
                        "ransomware_use": v.get("knownRansomwareCampaignUse", "Unknown"),
                    }

            _kev_set = new_set
            _kev_details = new_details
            _kev_last_fetch = time.time()
            print(f"[KEV] Loaded {len(_kev_set)} known exploited vulnerabilities")

    except httpx.TimeoutException:
        print("[KEV] Timeout downloading catalog")
    except Exception as e:
        print(f"[KEV] Error: {e}")


async def is_in_kev(cve_id: str) -> bool:
    """Check if a CVE is in the CISA KEV catalog."""
    await _ensure_loaded()
    return cve_id in _kev_set


async def get_kev_details(cve_id: str) -> dict | None:
    """Get KEV entry details (required_action, due_date, ransomware_use, etc.)."""
    await _ensure_loaded()
    return _kev_details.get(cve_id)


async def enrich_vulnerabilities_with_kev(packages: list[dict]) -> None:
    """
    Mutate each package's vulnerability entries in-place to add KEV data.
    Also sets package-level in_kev flag and kev_ransomware flag.
    """
    await _ensure_loaded()

    for pkg in packages:
        pkg_in_kev = False
        pkg_ransomware = False

        for vuln in pkg.get("vulnerabilities", []):
            vuln_id = vuln.get("cve_id") or vuln.get("id", "")
            if vuln_id in _kev_set:
                details = _kev_details.get(vuln_id, {})
                vuln["in_kev"] = True
                vuln["kev_date_added"] = details.get("date_added", "")
                vuln["kev_due_date"] = details.get("due_date", "")
                vuln["kev_required_action"] = details.get("required_action", "")
                vuln["kev_ransomware"] = details.get("ransomware_use", "Unknown")
                pkg_in_kev = True
                if details.get("ransomware_use") == "Known":
                    pkg_ransomware = True
            else:
                vuln["in_kev"] = False
                vuln["kev_ransomware"] = None

        pkg["in_kev"] = pkg_in_kev
        pkg["kev_ransomware"] = pkg_ransomware
