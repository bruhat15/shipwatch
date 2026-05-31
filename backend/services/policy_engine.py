"""
Policy Engine — Evaluates packages against configurable security policies.
Produces BLOCK/WARN violations so scans feel like a security gate.
"""

from datetime import datetime, timezone

# Default policies — ordered from most to least severe.
DEFAULT_POLICIES: list[dict] = [
    {
        "id": "block-critical-cvss",
        "name": "Block CRITICAL CVEs (CVSS ≥ 9.0)",
        "description": "Block any package with a CVSS score of 9.0 or above.",
        "rule": "cvss_critical",
        "action": "block",
        "enabled": True,
    },
    {
        "id": "warn-high-severity",
        "name": "Warn on HIGH severity CVEs",
        "description": "Warn when a package has a HIGH severity vulnerability (CVSS 7.0-8.9).",
        "rule": "high_severity",
        "action": "warn",
        "enabled": True,
    },
    {
        "id": "warn-deprecated",
        "name": "Warn on deprecated packages",
        "description": "Warn when a package is marked deprecated on npm.",
        "rule": "deprecated",
        "action": "warn",
        "enabled": True,
    },
    {
        "id": "warn-stale",
        "name": "Warn on stale packages (no commits > 365 days)",
        "description": "Warn when a package's repository hasn't had a commit in over a year.",
        "rule": "stale_365",
        "action": "warn",
        "enabled": True,
    },
    {
        "id": "block-copyleft",
        "name": "Block copyleft licenses (GPL/AGPL)",
        "description": "Block packages with copyleft licenses that require your project to be open-sourced.",
        "rule": "copyleft_license",
        "action": "block",
        "enabled": False,
    },
    {
        "id": "warn-single-maintainer",
        "name": "Warn on single-maintainer packages",
        "description": "Warn when a package has only one npm maintainer (bus-factor risk).",
        "rule": "single_maintainer",
        "action": "warn",
        "enabled": False,
    },
    {
        "id": "block-low-score",
        "name": "Block packages with risk score > 8.0",
        "description": "Block packages with an overall ShipWatch risk score above 8.0/10.",
        "rule": "risk_score_gt_8",
        "action": "block",
        "enabled": False,
    },
]

COPYLEFT_TERMS = {"GPL", "AGPL", "LGPL", "MPL", "EUPL", "CPAL", "OSL"}


def evaluate_policies(package: dict, policies: list[dict] | None = None) -> list[dict]:
    """
    Evaluate a package against enabled policies.
    Returns a list of violation dicts: {policy_id, policy_name, action, package, reason}
    """
    if policies is None:
        policies = DEFAULT_POLICIES

    violations: list[dict] = []

    for policy in policies:
        if not policy.get("enabled"):
            continue

        rule = policy.get("rule", "")
        triggered = False
        reason = ""

        if rule == "cvss_critical":
            for v in package.get("vulnerabilities", []):
                cvss = v.get("cvss_score")
                if cvss and float(cvss) >= 9.0:
                    triggered = True
                    reason = f"CVE {v.get('id', '?')} has CVSS {cvss}"
                    break
                if v.get("severity") == "CRITICAL" and not cvss:
                    triggered = True
                    reason = f"CVE {v.get('id', '?')} is CRITICAL severity"
                    break

        elif rule == "high_severity":
            for v in package.get("vulnerabilities", []):
                cvss = v.get("cvss_score")
                sev = v.get("severity", "")
                if (cvss and 7.0 <= float(cvss) < 9.0) or (not cvss and sev == "HIGH"):
                    triggered = True
                    reason = f"CVE {v.get('id', '?')} is HIGH severity"
                    break

        elif rule == "deprecated":
            if package.get("deprecated"):
                triggered = True
                reason = f"{package.get('name')} is deprecated on npm"

        elif rule == "stale_365":
            last_commit = package.get("last_commit")
            if last_commit:
                try:
                    lc = datetime.fromisoformat(str(last_commit).replace("Z", "+00:00"))
                    days = (datetime.now(timezone.utc) - lc).days
                    if days > 365:
                        triggered = True
                        reason = f"No commits in {days} days"
                except (ValueError, TypeError):
                    pass

        elif rule == "copyleft_license":
            lic = package.get("license", "") or ""
            if any(term in lic.upper() for term in COPYLEFT_TERMS):
                triggered = True
                reason = f"License '{lic}' is copyleft"

        elif rule == "single_maintainer":
            m = package.get("maintainers_count")
            if m is not None and m <= 1:
                triggered = True
                reason = f"Only {m} npm maintainer(s)"

        elif rule == "risk_score_gt_8":
            score = package.get("risk_score", 0)
            if float(score or 0) > 8.0:
                triggered = True
                reason = f"Risk score {score}/10 exceeds threshold 8.0"

        if triggered:
            violations.append({
                "policy_id": policy["id"],
                "policy_name": policy["name"],
                "action": policy["action"],
                "package": package.get("name", "unknown"),
                "version": package.get("version", "?"),
                "reason": reason,
            })

    return violations


def evaluate_scan_policies(packages: list[dict], policies: list[dict] | None = None) -> list[dict]:
    """
    Evaluate all packages in a scan against policies.
    Returns a flat list of all violations across all packages.
    """
    all_violations: list[dict] = []
    for pkg in packages:
        violations = evaluate_policies(pkg, policies)
        all_violations.extend(violations)
    return all_violations
