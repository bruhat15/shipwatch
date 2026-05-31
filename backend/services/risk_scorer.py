"""
Risk Scorer — 0-10 CVSS-grounded risk model.
Combines security (CVSS), maintenance (OpenSSF Scorecard), and ecosystem signals.
Includes License Conflict Detection as a unique feature.

Methodology: see SCORING.md
"""

import math
from datetime import datetime, timezone


# --- License compatibility matrix ---
PERMISSIVE_LICENSES = {
    "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
    "0BSD", "Unlicense", "CC0-1.0", "WTFPL", "Zlib", "BlueOak-1.0.0",
    "(MIT AND CC-BY-3.0)", "MIT*", "(MIT OR Apache-2.0)",
    "(BSD-2-Clause OR MIT OR Apache-2.0)", "(MIT OR CC0-1.0)",
}

COPYLEFT_LICENSES = {
    "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later",
    "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
    "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
    "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later",
    "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later",
    "MPL-2.0", "EUPL-1.2", "CPAL-1.0", "OSL-3.0",
}


def _normalize_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in ("", "false", "0", "no", "none", "null"):
            return False
        return True
    return bool(value)


def score_dependencies(deps: list[dict]) -> list[dict]:
    """Score a list of enriched dependencies on a 0-10 risk scale.
    
    Returns scored list sorted: critical first, then warning, then healthy,
    each sub-sorted by risk_score descending.
    """
    scored = []

    for dep in deps:
        dep_deprecated = _normalize_bool(dep.get("deprecated"))
        security = _security_risk(dep)
        maintenance = _maintenance_risk(dep)
        ecosystem = _ecosystem_risk(dep)

        # Weighted composite (0-10 scale)
        composite = round(0.40 * security + 0.35 * maintenance + 0.25 * ecosystem, 1)

        # Hard override: CVSS >= 9.0 or CRITICAL severity forces critical
        has_critical = any(
            v.get("cvss_score", 0) and float(v.get("cvss_score", 0)) >= 9.0
            or v.get("severity") == "CRITICAL"
            for v in dep.get("vulnerabilities", [])
        )

        if has_critical or composite >= 6.1:
            risk_level = "critical"
        elif composite >= 3.1:
            risk_level = "warning"
        else:
            risk_level = "healthy"

        # Confidence: how many dimensions have real data?
        has_security_data = len(dep.get("vulnerabilities", [])) > 0 or dep.get("vuln_count", 0) > 0
        has_maintenance_data = dep.get("last_commit") is not None or dep.get("scorecard_score") is not None
        has_ecosystem_data = dep.get("weekly_downloads") is not None
        dims_with_data = sum([has_security_data, has_maintenance_data, has_ecosystem_data])
        confidence = ["low", "low", "medium", "high"][dims_with_data]

        # License check
        license_issues = check_license(dep.get("license"))

        scored.append({
            **dep,
            "deprecated": dep_deprecated,
            "risk_score": composite,
            "risk_level": risk_level,
            "confidence": confidence,
            "license_issues": license_issues,
            "_security_risk": round(security, 1),
            "_maintenance_risk": round(maintenance, 1),
            "_ecosystem_risk": round(ecosystem, 1),
        })

    # Sort: critical first, then by score descending
    level_order = {"critical": 0, "warning": 1, "healthy": 2}
    scored.sort(key=lambda x: (level_order.get(x["risk_level"], 3), -x["risk_score"]))

    return scored


def _security_risk(dep: dict) -> float:
    """0-10 security risk score grounded in CVSS (NIST standard)."""
    vulns = dep.get("vulnerabilities", [])
    if not vulns:
        return 0.0

    # Use max CVSS score if available, else map severity labels
    severity_map = {"CRITICAL": 9.5, "HIGH": 7.5, "MEDIUM": 5.0, "LOW": 2.5}
    max_score = 0.0

    for v in vulns:
        cvss = v.get("cvss_score")
        if cvss is not None:
            try:
                max_score = max(max_score, float(cvss))
            except (ValueError, TypeError):
                pass
        else:
            sev = v.get("severity", "MEDIUM")
            max_score = max(max_score, severity_map.get(sev, 5.0))

    # Additional vulns: +0.5 each, capped at +3.0
    extra = min((len(vulns) - 1) * 0.5, 3.0)

    # Unfixed vulns: +1.0
    unfixed = 1.0 if any(not v.get("fixed_version") for v in vulns) else 0.0

    return min(max_score + extra + unfixed, 10.0)


def _maintenance_risk(dep: dict) -> float:
    """0-10 maintenance risk. Uses OpenSSF Scorecard when available."""
    # Option A: Use Scorecard data (0-10 where 10=best)
    scorecard = dep.get("scorecard_score")
    if scorecard is not None:
        try:
            return round(min(max(10.0 - float(scorecard), 0.0), 10.0), 1)
        except (ValueError, TypeError):
            pass

    # Option B: Heuristic fallback
    score = 5.0  # Default when no data

    last_commit = dep.get("last_commit")
    if last_commit:
        try:
            if isinstance(last_commit, str):
                lc = datetime.fromisoformat(last_commit.replace("Z", "+00:00"))
            else:
                lc = last_commit

            days = (datetime.now(timezone.utc) - lc).days

            if days <= 90:
                score = 1.0
            elif days <= 180:
                score = 3.0
            elif days <= 365:
                score = 5.0
            elif days <= 730:
                score = 7.0
            else:
                score = 9.0
        except (ValueError, TypeError):
            pass

    # Contributor adjustment
    contributors = dep.get("contributors_count")
    if contributors is not None:
        if contributors <= 1:
            score = min(score + 1.0, 10.0)
        elif contributors <= 3:
            score = min(score + 0.5, 10.0)

    return score


def _ecosystem_risk(dep: dict) -> float:
    """0-10 ecosystem risk. Log-scale for downloads."""
    if dep.get("deprecated"):
        return 10.0

    score = 3.0  # Default when no data

    downloads = dep.get("weekly_downloads")
    if downloads is not None and downloads > 0:
        # Log scale: 10M → 0 risk, 100 → ~7 risk
        health = min(math.log10(downloads) / 7.0 * 10.0, 10.0)
        score = round(10.0 - health, 1)
    elif downloads is not None and downloads == 0:
        score = 8.0

    # No license
    lic = dep.get("license")
    if not lic or lic in ("UNLICENSED", "NONE", ""):
        score = min(score + 2.0, 10.0)

    # Single maintainer
    maintainers = dep.get("maintainers_count")
    if maintainers is not None and maintainers <= 1:
        score = min(score + 1.5, 10.0)

    return score


# --- License Conflict Detection ---

def check_license(license_str: str | None) -> list[dict]:
    """
    Check a package's license for potential issues.
    Returns a list of issue dicts: {type, severity, message}
    """
    issues = []

    if not license_str or license_str in ("UNLICENSED", "NONE", ""):
        issues.append({
            "type": "missing",
            "severity": "warning",
            "message": "No license specified — legal risk; usage terms are undefined.",
        })
        return issues

    normalized = license_str.strip()

    # Check for copyleft / viral licenses
    for copyleft in COPYLEFT_LICENSES:
        if copyleft in normalized.upper() or copyleft in normalized:
            severity = "critical" if "GPL" in normalized.upper() or "AGPL" in normalized.upper() else "warning"
            issues.append({
                "type": "copyleft",
                "severity": severity,
                "message": f"License '{normalized}' is copyleft — may require your project to adopt the same license.",
            })
            break

    # Check for unknown / exotic licenses
    if not issues and normalized not in PERMISSIVE_LICENSES:
        is_likely_permissive = any(p in normalized for p in ("MIT", "BSD", "ISC", "Apache"))
        if not is_likely_permissive:
            issues.append({
                "type": "unknown",
                "severity": "info",
                "message": f"License '{normalized}' is uncommon — review compatibility manually.",
            })

    return issues


def get_license_summary(scored_deps: list[dict]) -> dict:
    """
    Generate a summary of license health across all dependencies.
    Returns stats + list of packages with issues.
    """
    total = len(scored_deps)
    clean = 0
    issues_list = []

    license_counts: dict[str, int] = {}

    for pkg in scored_deps:
        lic = pkg.get("license", "Unknown")
        license_counts[lic] = license_counts.get(lic, 0) + 1

        pkg_issues = pkg.get("license_issues", [])
        if pkg_issues:
            issues_list.append({
                "package": pkg["name"],
                "license": lic,
                "issues": pkg_issues,
            })
        else:
            clean += 1

    return {
        "total_packages": total,
        "clean_licenses": clean,
        "packages_with_issues": len(issues_list),
        "license_distribution": dict(sorted(license_counts.items(), key=lambda x: -x[1])),
        "issues": issues_list,
    }
