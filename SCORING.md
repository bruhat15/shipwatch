# ShipWatch Scoring Methodology

## Overview

ShipWatch scores each dependency on a **0–10 risk scale** across three dimensions. Higher scores indicate greater risk.

| Risk Level | Score Range | Meaning |
|-----------|------------|---------|
| 🟢 Healthy | 0.0 – 3.0 | Low risk. No action needed. |
| 🟡 Warning | 3.1 – 6.0 | Moderate risk. Review and plan remediation. |
| 🔴 Critical | 6.1 – 10.0 | High risk. Immediate action required. |

**Hard override**: Any dependency with a CVSS ≥ 9.0 vulnerability is automatically classified as Critical regardless of composite score.

---

## Composite Score Formula

```
Risk = 0.40 × Security + 0.35 × Maintenance + 0.25 × Ecosystem
```

Each dimension is independently normalized to a 0–10 scale before weighting.

### Why These Weights?

| Dimension | Weight | Rationale |
|-----------|--------|-----------|
| Security | 40% | Known vulnerabilities are the most direct and exploitable risk. This aligns with OpenSSF Scorecard's assignment of "Critical" risk weight (10) to vulnerability-related checks. |
| Maintenance | 35% | Unmaintained packages with no recent commits are statistically more likely to have unpatched vulnerabilities (Socket.dev research, 2024). |
| Ecosystem | 25% | Low adoption, few maintainers, or deprecated status indicate fragile packages, but these are slower-burning risks. |

---

## Dimension 1: Security Risk (0–10)

**Grounded in**: [CVSS v3.1](https://www.first.org/cvss/v3.1/specification-document) — the Common Vulnerability Scoring System maintained by NIST/FIRST.

| Signal | Score Contribution |
|--------|-------------------|
| Maximum CVSS score across all CVEs | Direct (0–10 scale already) |
| Severity label fallback (no CVSS data) | CRITICAL→9.5, HIGH→7.5, MEDIUM→5.0, LOW→2.5 |
| Additional vulnerabilities beyond first | +0.5 each (capped at +3.0) |
| Any vulnerability without a known fix | +1.0 |
| **Total cap** | **10.0** |

**Why CVSS?** CVSS is the universal standard for vulnerability severity, published by NIST. Every major security tool (Snyk, Qualys, Tenable) uses it. Our security scores inherit its calibration rather than inventing our own.

---

## Dimension 2: Maintenance Risk (0–10)

**Primary source**: [OpenSSF Scorecard](https://securityscorecards.dev/) — a Linux Foundation project that evaluates the security health of open source projects.

**When Scorecard data is available** (free API, no auth):
```
Maintenance Risk = 10.0 − Scorecard Score
```
Scorecard evaluates 18 checks including code review, CI tests, branch protection, and dependency tooling.

**Fallback heuristic** (when Scorecard is unavailable):

| Signal | Risk Score |
|--------|-----------|
| Last commit: 0–90 days | 1.0 |
| Last commit: 91–180 days | 3.0 |
| Last commit: 181–365 days | 5.0 |
| Last commit: 1–2 years | 7.0 |
| Last commit: 2+ years | 9.0 |
| ≤1 contributor | +1.0 |
| 2–3 contributors | +0.5 |
| **Total cap** | **10.0** |

---

## Dimension 3: Ecosystem Risk (0–10)

| Signal | Score Calculation |
|--------|-----------------|
| Downloads | Log scale: `risk = 10 − min(log₁₀(downloads) / 7 × 10, 10)`. 10M downloads → 0 risk. 100 downloads → ~7 risk. |
| Deprecated on npm | Forced to 10.0 (maximum risk) |
| No license specified | +2.0 |
| Single maintainer | +1.5 |
| **Total cap** | **10.0** |

**Why log scale for downloads?** The difference between 100 and 1,000 downloads matters much more than between 10M and 100M. A logarithmic scale captures this diminishing returns relationship.

---

## Confidence Indicator

Not all packages have data from all three dimensions. ShipWatch tracks this:

| Dimensions with Data | Confidence |
|---------------------|------------|
| 3 of 3 | High |
| 2 of 3 | Medium |
| 0–1 of 3 | Low |

Low-confidence scores are displayed with a badge so users know to interpret them cautiously.

---

## Phase O: Decision Intelligence (Fix Now / Watch / Ignore)

ShipWatch adds an actionable decision layer on top of the risk score. This layer
combines EPSS exploitation probability, CISA KEV known-exploitation signals,
CVSS severity, and dependency type (production vs dev).

### Fix Now Triggers

- **KEV Ransomware**: Any vulnerability flagged as used in ransomware campaigns.
- **In KEV Catalog**: Actively exploited vulnerabilities per CISA.
- **EPSS ≥ 0.40**: High exploitation probability within 30 days.
- **CVSS ≥ 9.0 with Fix Available**: Critical severity with a patch.

**Dev dependency downgrade**: If a package is dev-only and not in KEV, Fix Now
is downgraded to Watch.

### Watch Triggers (when not Fix Now)

- **EPSS 0.05–0.40**: Moderate exploitation probability.
- **CVSS ≥ 7.0 without active exploitation**: High severity without KEV/EPSS.
- **Deprecated**: Package is no longer maintained.
- **Unmaintained + Vulnerable**: Maintenance risk ≥ 7.0 with known CVEs.
- **CVSS ≥ 9.0 with No Fix**: Critical severity, patch not yet available.

### Ignore Signals

- **Dev-only with no vulnerabilities**: Does not ship to production.
- **EPSS < 0.05**: Very low exploitation likelihood.
- **No known vulnerabilities**: Clean package with no exploit data.

Each decision includes a reason list, confidence level, and urgency rank used
to sort Fix Now items ahead of Watch/Ignore.

---

## Calibration

These thresholds were validated by scanning 10+ popular open source projects and verifying:
- `express` (well-maintained, popular) → scores as Healthy
- `lodash` (widely used, some CVEs) → scores as Warning  
- Packages with known critical CVEs → score as Critical
- Deprecated packages → score as Critical

---

## References

- [CVSS v3.1 Specification](https://www.first.org/cvss/v3.1/specification-document) — FIRST/NIST
- [OpenSSF Scorecard](https://securityscorecards.dev/) — Linux Foundation
- [OSV Database](https://osv.dev/) — Google Open Source Vulnerabilities
- [npm Registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)
