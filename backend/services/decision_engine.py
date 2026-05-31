"""
Decision Engine — Converts risk scores + EPSS + KEV + dep_type into actionable decisions.

For every dependency, produces: "fix_now", "watch", or "ignore"
backed by an evidence list explaining WHY.

This is the core differentiator of ShipWatch.
"""


def decide(pkg: dict) -> dict:
    """
    Analyze a scored + enriched package and return an action decision.

    Expects pkg to have been through:
      - risk_scorer (risk_score, risk_level, _security_risk, etc.)
      - epss_client (epss_max_score, per-vuln epss_score)
      - kev_client (in_kev, kev_ransomware, per-vuln in_kev)
      - dep_parser (dep_type: "production" | "dev")

    Returns:
        {
            "action": "fix_now" | "watch" | "ignore",
            "reasons": [{"signal": str, "detail": str, "icon": str}, ...],
            "confidence": "high" | "medium" | "low",
            "urgency_rank": int  # lower = more urgent
        }
    """
    reasons = []
    action = "ignore"
    urgency_rank = 100
    data_points = 0  # for confidence

    dep_type = pkg.get("dep_type", "production")
    is_dev = dep_type == "dev"
    vulns = pkg.get("vulnerabilities", [])
    vuln_count = pkg.get("vuln_count", 0) or len(vulns)
    risk_score = pkg.get("risk_score", 0) or 0
    deprecated = pkg.get("deprecated", False)
    maintenance_risk = pkg.get("_maintenance_risk") or pkg.get("maintenance_risk") or 0

    # --- Collect signals ---

    # EPSS signal
    epss_max = pkg.get("epss_max_score") or 0
    if epss_max > 0:
        data_points += 1

    # KEV signal
    pkg_in_kev = pkg.get("in_kev", False)
    pkg_ransomware = pkg.get("kev_ransomware", False)
    if pkg_in_kev:
        data_points += 1

    # CVSS signal
    max_cvss = 0.0
    has_fix = False
    has_unfixed = False
    for vuln in vulns:
        cvss = vuln.get("cvss_score") or 0
        if isinstance(cvss, str):
            try:
                cvss = float(cvss)
            except ValueError:
                cvss = 0
        max_cvss = max(max_cvss, cvss)
        if vuln.get("fixed_version"):
            has_fix = True
        else:
            has_unfixed = True
    if max_cvss > 0:
        data_points += 1

    # dep_type signal
    if is_dev:
        reasons.append({
            "signal": "dev_dependency",
            "detail": "Dev dependency — not deployed to production",
            "icon": "🧪",
        })

    # --- FIX NOW rules ---

    fix_now_triggered = False

    # Rule 1: KEV ransomware
    if pkg_ransomware:
        reasons.append({
            "signal": "kev_ransomware",
            "detail": "Used in active ransomware campaigns (CISA KEV)",
            "icon": "💀",
        })
        fix_now_triggered = True
        urgency_rank = min(urgency_rank, 1)

    # Rule 2: In KEV
    if pkg_in_kev and not pkg_ransomware:
        kev_vulns = [v for v in vulns if v.get("in_kev")]
        kev_ids = ", ".join(v.get("id", "?") for v in kev_vulns[:3])
        reasons.append({
            "signal": "in_kev",
            "detail": f"Actively exploited in the wild — CISA KEV ({kev_ids})",
            "icon": "🎯",
        })
        fix_now_triggered = True
        urgency_rank = min(urgency_rank, 2)

    # Rule 3: High EPSS
    if epss_max >= 0.4:
        pct = round(epss_max * 100, 1)
        reasons.append({
            "signal": "epss_high",
            "detail": f"{pct}% chance of exploitation within 30 days (EPSS)",
            "icon": "⚡",
        })
        fix_now_triggered = True
        urgency_rank = min(urgency_rank, 3)

    # Rule 4: Critical CVSS with fix available
    if max_cvss >= 9.0 and has_fix:
        reasons.append({
            "signal": "cvss_critical_fixable",
            "detail": f"Critical severity (CVSS {max_cvss}) with patch available",
            "icon": "🔧",
        })
        fix_now_triggered = True
        urgency_rank = min(urgency_rank, 4)

    if fix_now_triggered:
        # Downgrade to WATCH if dev-only and NOT in KEV
        if is_dev and not pkg_in_kev:
            action = "watch"
            urgency_rank = min(urgency_rank + 20, 50)
            reasons.append({
                "signal": "dev_downgrade",
                "detail": "Downgraded from Fix Now — dev dependency not deployed to production",
                "icon": "⬇️",
            })
        else:
            action = "fix_now"

    # --- WATCH rules (only if not already fix_now) ---

    if action == "ignore":
        watch_triggered = False

        # Rule W1: Moderate EPSS
        if 0.05 <= epss_max < 0.4:
            pct = round(epss_max * 100, 1)
            reasons.append({
                "signal": "epss_moderate",
                "detail": f"{pct}% exploitation probability — moderate risk (EPSS)",
                "icon": "📊",
            })
            watch_triggered = True
            urgency_rank = min(urgency_rank, 30)

        # Rule W2: High CVSS but no known exploit
        if max_cvss >= 7.0 and not pkg_in_kev and epss_max < 0.4:
            reasons.append({
                "signal": "cvss_high_no_exploit",
                "detail": f"High severity (CVSS {max_cvss}) but no known active exploitation",
                "icon": "⚠️",
            })
            watch_triggered = True
            urgency_rank = min(urgency_rank, 35)

        # Rule W3: Deprecated
        if deprecated:
            reasons.append({
                "signal": "deprecated",
                "detail": "Deprecated — no future security patches expected",
                "icon": "📦",
            })
            watch_triggered = True
            urgency_rank = min(urgency_rank, 40)

        # Rule W4: Unmaintained with vulns
        if maintenance_risk >= 7.0 and vuln_count > 0:
            reasons.append({
                "signal": "unmaintained_vulns",
                "detail": f"Unmaintained (maintenance risk {maintenance_risk}/10) with {vuln_count} known vulnerabilities",
                "icon": "🕸️",
            })
            watch_triggered = True
            urgency_rank = min(urgency_rank, 45)

        # Rule W5: Critical CVSS but no fix
        if max_cvss >= 9.0 and not has_fix:
            reasons.append({
                "signal": "cvss_critical_no_fix",
                "detail": f"Critical severity (CVSS {max_cvss}) — no patch available yet",
                "icon": "🚨",
            })
            watch_triggered = True
            urgency_rank = min(urgency_rank, 25)

        if watch_triggered:
            action = "watch"

    # --- IGNORE evidence ---

    if action == "ignore":
        urgency_rank = 90

        # Special case: dev dep with zero vulns
        if is_dev and vuln_count == 0:
            reasons.append({
                "signal": "dev_no_vulns",
                "detail": "Dev-only dependency with no known vulnerabilities",
                "icon": "✅",
            })
            urgency_rank = 99

        if epss_max < 0.05 and epss_max >= 0:
            if vuln_count > 0:
                reasons.append({
                    "signal": "epss_low",
                    "detail": "Very low exploitation probability (EPSS < 5%)",
                    "icon": "📉",
                })

        if vuln_count == 0 and not deprecated:
            reasons.append({
                "signal": "clean",
                "detail": "No known vulnerabilities",
                "icon": "✅",
            })
            urgency_rank = 100

    # --- Production tag ---

    if not is_dev and action in ("fix_now", "watch"):
        reasons.append({
            "signal": "production",
            "detail": "Production dependency — ships in your deployed code",
            "icon": "🏭",
        })

    # --- Fix availability ---

    if has_fix and vuln_count > 0 and action in ("fix_now", "watch"):
        reasons.append({
            "signal": "fix_available",
            "detail": "Patch available — upgrade to fix",
            "icon": "🔧",
        })
    elif has_unfixed and vuln_count > 0 and action in ("fix_now", "watch"):
        reasons.append({
            "signal": "no_fix",
            "detail": "No patch available — monitor for updates or find alternative",
            "icon": "⏳",
        })

    # --- Confidence ---

    if data_points >= 2:
        confidence = "high"
    elif data_points == 1:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "action": action,
        "reasons": reasons,
        "confidence": confidence,
        "urgency_rank": urgency_rank,
    }


def decide_all(packages: list[dict]) -> list[dict]:
    """
    Run the decision engine on all packages. Mutates each package in-place
    by adding 'decision' key. Returns packages sorted by urgency.
    """
    for pkg in packages:
        pkg["decision"] = decide(pkg)

    # Sort: fix_now first, then watch, then ignore — sub-sorted by urgency_rank
    action_order = {"fix_now": 0, "watch": 1, "ignore": 2}
    packages.sort(
        key=lambda p: (
            action_order.get(p.get("decision", {}).get("action", "ignore"), 2),
            p.get("decision", {}).get("urgency_rank", 100),
            -(p.get("risk_score", 0) or 0),
        )
    )

    return packages
