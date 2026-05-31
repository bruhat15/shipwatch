"""
Fix Generator — Generates actionable fix recommendations for each dependency package.
Produces typed, urgency-sorted suggestions: upgrades, migrations, monitoring, and license reviews.
"""

from datetime import datetime, timezone


# Urgency ordering for final sort
_URGENCY_ORDER = {"now": 0, "soon": 1, "later": 2}


def generate_fixes(package: dict) -> list[dict]:
    """Generate actionable fix recommendations for a risky package."""
    fixes: list[dict] = []
    name = package.get("name", "unknown")

    # 1. Vulnerability-driven upgrade recommendations
    _add_vuln_fixes(fixes, package, name)

    # 2. Deprecation warning
    if package.get("deprecated") is True:
        fixes.append({
            "type": "migrate",
            "urgency": "soon",
            "title": f"Replace {name}",
            "description": f"{name} is deprecated on npm. Find an actively maintained alternative.",
            "command": None,
        })

    # 3. Stale repository monitoring
    _add_staleness_fix(fixes, package, name)

    # 4. License issue reviews
    for issue in package.get("license_issues", []):
        fixes.append({
            "type": "review",
            "urgency": "soon" if issue.get("severity") == "critical" else "later",
            "title": f"License: {issue.get('type', 'unknown')}",
            "description": issue.get("message", ""),
            "command": None,
        })

    # Sort by urgency: now → soon → later
    fixes.sort(key=lambda f: _URGENCY_ORDER.get(f["urgency"], 99))

    return fixes


def _add_vuln_fixes(fixes: list[dict], package: dict, name: str) -> None:
    """Add upgrade fixes for vulnerabilities, deduplicating by fixed_version."""
    vulns = package.get("vulnerabilities", [])

    # Group vulns by fixed_version for deduplication
    # For each fixed_version, keep the vuln with the highest severity
    version_map: dict[str, dict] = {}
    severity_rank = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

    for vuln in vulns:
        fixed_version = vuln.get("fixed_version")
        if not fixed_version:
            continue

        severity = vuln.get("severity", "LOW")
        vuln_id = vuln.get("id", "unknown")

        existing = version_map.get(fixed_version)
        if existing is None:
            version_map[fixed_version] = {
                "fixed_version": fixed_version,
                "severity": severity,
                "vuln_id": vuln_id,
            }
        else:
            # Keep the entry with the higher severity
            if severity_rank.get(severity, 0) > severity_rank.get(existing["severity"], 0):
                version_map[fixed_version] = {
                    "fixed_version": fixed_version,
                    "severity": severity,
                    "vuln_id": vuln_id,
                }

    # Generate one fix per unique fixed_version
    for entry in version_map.values():
        severity = entry["severity"]
        vuln_id = entry["vuln_id"]
        fixed_version = entry["fixed_version"]

        urgency = "now" if severity in ("CRITICAL", "HIGH") else "soon"

        fixes.append({
            "type": "upgrade",
            "urgency": urgency,
            "title": f"Fix {vuln_id}",
            "description": f"Upgrade {name} to {fixed_version} to patch {vuln_id} ({severity})",
            "command": f"npm install {name}@{fixed_version}",
        })


def _add_staleness_fix(fixes: list[dict], package: dict, name: str) -> None:
    """Add a monitoring fix if the repo has not been committed to in over a year."""
    last_commit = package.get("last_commit")
    if not last_commit:
        return

    try:
        if isinstance(last_commit, str):
            lc = datetime.fromisoformat(last_commit.replace("Z", "+00:00"))
        else:
            lc = last_commit

        now = datetime.now(timezone.utc)
        days = (now - lc).days

        if days > 365:
            fixes.append({
                "type": "monitor",
                "urgency": "later",
                "title": f"Monitor {name}",
                "description": f"No commits in {days} days. Consider finding an alternative or forking.",
                "command": None,
            })
    except (ValueError, TypeError):
        pass
