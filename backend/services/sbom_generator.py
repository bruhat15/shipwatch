"""
SBOM Generator — CycloneDX 1.5 JSON exporter for ShipWatch scan results.
Produces standards-compliant Software Bill of Materials.

Spec: https://cyclonedx.org/specification/overview/
"""

import json
import uuid
from datetime import datetime, timezone


def generate_cyclonedx_sbom(scan: dict) -> dict:
    """
    Generate a CycloneDX 1.5 SBOM from a completed ShipWatch scan result dict.
    Returns a dict suitable for JSON serialisation.
    """
    packages = scan.get("packages", [])
    components = []
    vulnerabilities = []

    for pkg in packages:
        name = pkg.get("name", "unknown")
        version = pkg.get("version", "unknown")
        purl = f"pkg:npm/{name}@{version}"

        component: dict = {
            "type": "library",
            "bom-ref": purl,
            "name": name,
            "version": version,
            "purl": purl,
        }

        # License
        lic = pkg.get("license")
        if lic and lic not in ("UNLICENSED", "NONE", ""):
            component["licenses"] = [{"license": {"id": lic}}]

        # ShipWatch risk extension (vendor extension)
        component["properties"] = [
            {"name": "shipwatch:risk_level", "value": str(pkg.get("risk_level", "unknown"))},
            {"name": "shipwatch:risk_score", "value": str(pkg.get("risk_score", 0))},
            {"name": "shipwatch:confidence", "value": str(pkg.get("confidence", "low"))},
        ]
        decision = pkg.get("decision") or {}
        if decision.get("action"):
            component["properties"].append(
                {"name": "shipwatch:decision_action", "value": str(decision.get("action"))}
            )
        if pkg.get("epss_max_score") is not None:
            component["properties"].append(
                {"name": "shipwatch:epss_max_score", "value": str(pkg.get("epss_max_score"))}
            )
        if pkg.get("in_kev") is not None:
            component["properties"].append(
                {"name": "shipwatch:in_kev", "value": str(pkg.get("in_kev"))}
            )
        if pkg.get("dep_type"):
            component["properties"].append(
                {"name": "shipwatch:dep_type", "value": str(pkg.get("dep_type"))}
            )
        if pkg.get("scorecard_score") is not None:
            component["properties"].append(
                {"name": "openssf:scorecard_score", "value": str(pkg["scorecard_score"])}
            )

        components.append(component)

        # Vulnerabilities
        for vuln in pkg.get("vulnerabilities", []):
            vid = vuln.get("id", "")
            if not vid:
                continue

            sev = vuln.get("severity", "unknown").lower()
            vuln_entry: dict = {
                "bom-ref": f"vuln-{vid}",
                "id": vid,
                "source": {
                    "name": "OSV",
                    "url": f"https://osv.dev/vulnerability/{vid}",
                },
                "ratings": [
                    {
                        "source": {"name": "OSV"},
                        "severity": sev,
                    }
                ],
                "description": vuln.get("summary", ""),
                "affects": [{"ref": purl}],
            }

            # CVSS score if available
            cvss = vuln.get("cvss_score")
            if cvss is not None:
                try:
                    vuln_entry["ratings"][0]["score"] = float(cvss)
                    vuln_entry["ratings"][0]["method"] = "CVSSv3"
                except (ValueError, TypeError):
                    pass

            # Fix info
            fixed = vuln.get("fixed_version")
            if fixed:
                vuln_entry["recommendation"] = f"Update {name} to version {fixed}"

            vulnerabilities.append(vuln_entry)

    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tools": [
                {
                    "vendor": "ShipWatch",
                    "name": "ShipWatch",
                    "version": "1.0.0",
                    "externalReferences": [
                        {"type": "website", "url": "https://github.com/shipwatch"}
                    ],
                }
            ],
            "component": {
                "type": "application",
                "bom-ref": f"app-{scan.get('repo_name', 'unknown')}",
                "name": scan.get("repo_name", "unknown"),
            },
            "properties": [
                {"name": "shipwatch:scan_id", "value": scan.get("scan_id", "")},
                {"name": "shipwatch:repo_url", "value": scan.get("repo_url", "")},
                {"name": "shipwatch:scanned_at", "value": scan.get("scanned_at", "")},
                {"name": "shipwatch:overall_score", "value": str(scan.get("overall_score", 0))},
            ],
        },
        "components": components,
        "vulnerabilities": vulnerabilities,
    }

    return sbom
