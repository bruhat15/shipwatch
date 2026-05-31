# ShipWatch

**Open-source supply chain intelligence that helps developers and security teams understand which dependency risks actually matter and what to do next.**

Modern applications pull in hundreds of dependencies. Traditional scanners flag everything, leaving teams drowning in CVE noise with no clear path forward. ShipWatch combines vulnerability data, exploitation intelligence, and ecosystem health signals to answer three questions:

1. **Which risks are real?** (CVSS + EPSS + CISA KEV)
2. **What should I do?** (Fix Now / Watch / Ignore decisions)
3. **How do I fix it?** (Actionable upgrade commands)

Built for the [Pirates of the Coral-bean Hackathon](https://withcoral.com/hackathon). Powered by [Coral](https://withcoral.com) for cross-source intelligence.

---

## Why Existing Scanners Create Noise

Traditional scanners answer: **"What vulnerabilities exist?"**

ShipWatch answers: **"What should I fix first?"**

---

## Why ShipWatch Exists

**The problem**: Your `package.json` has 15 direct dependencies. `npm install` pulls in 200+ transitive packages you didn't choose. Any one could be compromised, abandoned, or exploited.

**Existing scanners** (Snyk, Dependabot, npm audit) tell you *what's vulnerable*. They don't tell you:
- Which vulnerabilities are actively exploited in the wild
- Whether a package is production or dev-only
- If the maintainer disappeared 2 years ago
- What to do first when you have 47 warnings

**ShipWatch** closes that gap. It's not just a scanner—it's a decision engine.

---

## Why Coral Matters

Traditional security tools call GitHub, OSV, npm, EPSS, and KEV **separately**.

ShipWatch uses **Coral** to treat them as a unified queryable dataset. This allows one query to correlate:
- Vulnerability data (OSV)
- Exploitation intelligence (EPSS, CISA KEV)
- Ecosystem health (npm downloads, deprecation)
- Maintenance signals (GitHub commits, OpenSSF Scorecard)

**without custom integration logic.**

This is what enables ShipWatch to answer "What should I fix first?" instead of just "What's vulnerable?"

---

## What Makes ShipWatch Different

| Feature | Traditional Scanners | ShipWatch |
|---------|---------------------|-----------|
| **Vulnerability detection** | ✅ OSV, NVD | ✅ OSV + CVSS scoring |
| **Exploitation intelligence** | ❌ | ✅ EPSS probability + CISA KEV catalog |
| **Maintenance health** | ❌ | ✅ OpenSSF Scorecard + commit recency |
| **Ecosystem signals** | ❌ | ✅ Downloads, deprecation, bus factor |
| **Actionable decisions** | ❌ (just lists CVEs) | ✅ Fix Now / Watch / Ignore with reasons |
| **Live streaming results** | ❌ | ✅ SSE — see packages as they're analyzed |
| **IDE queryable** | ❌ | ✅ Query scan data from Claude/Cursor via MCP |
| **CI/CD gate** | ✅ | ✅ GitHub Actions with configurable thresholds |
| **SBOM export** | Some | ✅ CycloneDX JSON |

---

## Core Features

### 🎯 Decision Intelligence

ShipWatch doesn't just report vulnerabilities—it tells you what to do.

- **Fix Now**: KEV-listed exploits, EPSS ≥ 0.40, CVSS ≥ 9.0 with patches
- **Watch**: Moderate EPSS, high severity without active exploitation, deprecated packages
- **Ignore**: Dev-only dependencies, EPSS < 0.05, no known vulnerabilities

Each decision includes evidence (EPSS score, KEV status, CVSS severity) and urgency ranking.

### 📊 Multi-Dimensional Risk Scoring

Every dependency gets a **0-10 risk score** across three dimensions:

- **Security**: CVSS severity, vulnerability count, patch availability
- **Maintenance**: OpenSSF Scorecard, commit recency, contributor count
- **Ecosystem**: Download volume, deprecation status, license, bus factor

**Grounded in standards**: CVSS (NIST), OpenSSF Scorecard (Linux Foundation), EPSS (FIRST), CISA KEV.

See [SCORING.md](./SCORING.md) for detailed methodology including dimension weights and calibration.

### 🔴 Live Scan Streaming

Watch your scan in real-time via Server-Sent Events (SSE). Packages appear on screen as they're analyzed—no waiting for a final report.

### 🛠️ Actionable Remediation

ShipWatch converts raw findings into developer-friendly remediation guidance:

- **Upgrade commands**: Copy-paste `npm install package@version` for every fixable CVE
- **Remediation checklist**: Track progress across all fixes with an interactive checklist
- **GitHub issue creation**: Auto-generate issues on your repo for critical vulnerabilities
- **Security badge**: Embed a live badge showing your scan's risk score

### 🔗 Workflow Integration

**CI/CD Gate**: GitHub Action that fails PRs when critical dependencies exceed your threshold.

```yaml
- uses: shipwatch/action@v1
  env:
    SHIPWATCH_API: ${{ secrets.SHIPWATCH_API_URL }}
    MAX_CRITICAL: 0  # Fail if any critical packages found
```

**IDE Integration**: Query scan data from Claude Code, Cursor, or GitHub Copilot using natural language via MCP.

```sql
-- Ask your AI assistant:
"Which packages in scan 55185b17 have EPSS > 0.5?"

-- Or query directly:
SELECT name, epss_max_score, in_kev, decision_action
FROM shipwatch.scans
WHERE scan_id = '55185b17' AND decision_action = 'fix_now'
```

### 📦 Reports & Exports

- **Markdown reports**: Human-readable summaries for PRs or Slack
- **JSON exports**: Machine-readable for custom tooling
- **CycloneDX SBOM**: Industry-standard format for compliance and audits

---

## How ShipWatch Works

```
┌─────────────────┐
│  GitHub Repo    │
│  package.json   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  1. Parse Dependencies                                  │
│     • Direct + transitive from package-lock.json        │
│     • Tag as production vs dev                          │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Enrich from 6 Sources (via Coral)                   │
│     • OSV: Known vulnerabilities + CVSS scores          │
│     • npm: Downloads, deprecation, maintainers          │
│     • GitHub: Stars, commits, contributors              │
│     • OpenSSF Scorecard: Security health (0-10)         │
│     • EPSS: Exploitation probability (0-1)              │
│     • CISA KEV: Known exploited vulnerabilities         │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Score & Decide                                      │
│     • Calculate 0-10 risk score (Security 40%,          │
│       Maintenance 35%, Ecosystem 25%)                   │
│     • Generate Fix Now / Watch / Ignore decision        │
│     • Produce upgrade commands for fixable CVEs         │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Stream Results (SSE)                                │
│     • Packages appear live as they're analyzed          │
│     • Frontend updates in real-time                     │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  5. Take Action                                         │
│     • Copy upgrade commands                             │
│     • Create GitHub issues                              │
│     • Export SBOM                                       │
│     • Query from IDE via MCP                            │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture

```
Frontend (Next.js 15 + TypeScript + Tailwind v4)
  ├── Landing page + features + blog
  ├── OAuth (GitHub + Google)
  ├── Dashboard + scan results
  └── Live SSE streaming

Backend (FastAPI + Python 3.10+)
  ├── OAuth + JWT auth
  ├── Scan pipeline with SSE
  ├── Risk scoring + decision engine
  ├── EPSS + KEV enrichment
  ├── Fix generation
  └── Exports (JSON, Markdown, SBOM)

Data Sources (via Coral)
  ├── OSV (vulnerabilities)
  ├── npm (ecosystem)
  ├── GitHub (maintenance)
  ├── OpenSSF Scorecard (security health)
  ├── EPSS (exploitation probability)
  └── CISA KEV (known exploits)

Storage: SQLite
Remediation Guidance: Gemini 2.5 Flash (optional)
```

---

## Installation

### Prerequisites

- **Node.js 18+** and **Python 3.10+**
- **Coral CLI** (optional but recommended for cross-source queries)

```bash
# macOS / Linux
curl -fsSL https://withcoral.com/install.sh | sh

# Windows (PowerShell)
irm https://withcoral.com/install.ps1 | iex
```

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys (see below)
python main.py
```

Backend runs on `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

---

## Environment Variables

### Backend (`.env`)

```bash
# Required for authentication
JWT_SECRET=your_random_32_char_string
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
FRONTEND_URL=http://localhost:3000

# Optional but recommended
GITHUB_TOKEN=ghp_...              # Higher API rate limits
GEMINI_API_KEY=...                # Enables AI summaries
```

**OAuth Setup**:
- GitHub: Create OAuth app at [github.com/settings/developers](https://github.com/settings/developers)
- Google: Create credentials at [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

### Frontend (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Quick Start Tutorial

### 1. Start a Scan

```bash
curl -X POST http://localhost:8000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/expressjs/express"}'
```

Response:
```json
{
  "scan_id": "55185b17",
  "status": "running",
  "message": "Scan started"
}
```

### 2. Watch Live Results (SSE)

```bash
curl -N http://localhost:8000/api/scan/55185b17/stream
```

You'll see packages stream in as they're analyzed:

```
event: package
data: {"name":"express","version":"4.18.2","risk_score":3.2,"risk_level":"warning",...}

event: package
data: {"name":"body-parser","version":"1.20.1","risk_score":1.8,"risk_level":"healthy",...}

event: done
data: {"status":"complete","total_deps":56,"critical_count":2,...}
```

### 3. Get Final Results

```bash
curl http://localhost:8000/api/results/55185b17
```

### 4. Export SBOM

```bash
curl http://localhost:8000/api/export/sbom/55185b17 > sbom.json
```

---

## Coral Integration (Cross-Source Intelligence)

ShipWatch uses [Coral](https://withcoral.com) to unify data from 6 sources with a single SQL query. Without Coral, ShipWatch falls back to direct API calls (slower, more rate-limited).

### Setup Coral Sources

```bash
# Add public sources
coral source add github
coral source add osv

# Add ShipWatch custom sources
coral source add --file ./backend/coral_specs/npm.yaml
coral source add --file ./backend/coral_specs/epss.yaml
coral source add --file ./backend/coral_specs/kev.yaml
coral source add --file ./backend/coral_specs/shipwatch.yaml
```

### Example Coral Query

```sql
-- Find all packages with EPSS > 0.5 and no fix available
SELECT 
  s.name,
  s.risk_score,
  s.epss_max_score,
  s.in_kev,
  s.decision_action
FROM shipwatch.scans s
WHERE s.scan_id = '55185b17'
  AND s.epss_max_score > 0.5
  AND s.decision_action = 'fix_now'
ORDER BY s.epss_max_score DESC
```

---

## MCP Integration (IDE Queryable)

ShipWatch exposes scan data as an MCP source via Coral. Query your dependency risks directly from Claude Code, Cursor, or GitHub Copilot.

### Setup

1. **Install Coral CLI** (see Installation section above)

2. **Register ShipWatch source**:
```bash
coral source add --file ./backend/coral_specs/shipwatch.yaml
```

3. **Configure your IDE** — add to MCP settings:
```json
{
  "mcpServers": {
    "coral": {
      "command": "coral",
      "args": ["mcp-stdio"]
    }
  }
}
```

4. **Query from your AI assistant**:

```
You: "Which packages in scan 55185b17 have critical CVEs?"


AI: [Queries ShipWatch via MCP]
    SELECT name, vuln_count, highest_severity, decision_action
    FROM shipwatch.scans
    WHERE scan_id = '55185b17' AND risk_level = 'critical'
```

**What you can ask**:
- "Show me all deprecated packages with more than 10k weekly downloads"
- "What's the average risk score for production dependencies?"
- "Which packages are in the CISA KEV catalog?"
- "List all packages with EPSS > 0.4 that have available fixes"

See [CORAL-MCP.md](./CORAL-MCP.md) for full column schema and query examples.

> **Deployment note**: Update `base_url` in `backend/coral_specs/shipwatch.yaml` to your production URL before deploying.

---

## CI/CD Integration

### GitHub Actions

Add `.github/workflows/shipwatch.yml`:

```yaml
name: ShipWatch Supply Chain Audit

on:
  pull_request:
    paths:
      - 'package.json'
      - 'package-lock.json'
  push:
    branches: [main]

jobs:
  shipwatch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run ShipWatch
        env:
          SHIPWATCH_API: ${{ secrets.SHIPWATCH_API_URL }}
          MAX_CRITICAL: 0  # Fail if any critical packages found
        run: |
          # See shipwatch-action.yml for full implementation
          curl -X POST "$SHIPWATCH_API/api/scan" \
            -d '{"repo_url":"https://github.com/${{ github.repository }}"}'
          # Poll for results, fail if critical_count > MAX_CRITICAL
```

Full action template: [shipwatch-action.yml](./shipwatch-action.yml)

### Configuration

Set these in your repository:

- **Secret**: `SHIPWATCH_API_URL` (your ShipWatch backend URL)
- **Variable**: `SHIPWATCH_MAX_CRITICAL` (default: `0`)

The action will:
1. Scan your repo on every PR that touches dependencies
2. Post results to the PR as a comment
3. Fail the check if critical packages exceed your threshold

---

## Live Workflow Example

**Scenario**: You're adding a new dependency to your Express app.

```bash
# 1. Add the package
npm install some-new-package

# 2. Commit and push
git add package.json package-lock.json
git commit -m "Add some-new-package"
git push origin feature-branch

# 3. GitHub Action triggers ShipWatch scan
# 4. PR check fails: "ShipWatch found 1 critical dependency"

# 5. Click the report link in the PR comment
# 6. See that some-new-package has CVE-2024-12345 (CVSS 9.8, EPSS 0.72, in KEV)
# 7. Decision: "Fix Now" with reason "In CISA KEV catalog + EPSS ≥ 0.40"

# 8. Copy the upgrade command from the fix card
npm install some-new-package@1.2.4

# 9. Push the fix
git add package.json package-lock.json
git commit -m "Upgrade some-new-package to patch CVE-2024-12345"
git push

# 10. ShipWatch re-scans, PR check passes ✅
```



## Roadmap

### Completed ✅
- Multi-source enrichment (OSV, npm, GitHub, Scorecard, EPSS, KEV)
- CVSS-grounded risk scoring
- Decision intelligence (Fix Now / Watch / Ignore)
- Live SSE streaming
- Actionable fix generation
- GitHub issue creation
- Remediation checklist
- SBOM export (CycloneDX)
- CI/CD gate (GitHub Actions)
- MCP integration (IDE queryable)
- OAuth (GitHub + Google)

### Vision 🚧

The next phase focuses on **deeper intelligence** and **broader coverage**:

- **Reachability Analysis**: Identify which vulnerable functions are actually called in your code
- **Attack Path Analysis**: Map transitive dependency chains that lead to exploitable code
- **Business Context Scoring**: Weight risks by service criticality (payment vs logging)
- **Policy Engine**: Codify organizational rules (block GPL, require 2+ maintainers)
- **Auto-Remediation**: Generate PRs with tested upgrades
- **Multi-Language Support**: Python (pip), Java (Maven), Go (go.mod), Rust (Cargo)

---

## Documentation

- **[PLAN.md](./PLAN.md)**: Full implementation plan (Phases A-O)
- **[SCORING.md](./SCORING.md)**: Risk scoring methodology and calibration
- **[CORAL-MCP.md](./CORAL-MCP.md)**: MCP integration guide and query reference
- **[BLOG.md](./BLOG.md)**: Hackathon build log (Captain's Log)

---

## Contributing

ShipWatch is open source and built for the community. Contributions welcome!

**Areas we'd love help with**:
- Additional language support (Python, Java, Go, Rust)
- Policy engine improvements
- UI/UX enhancements
- Documentation and tutorials
- Bug reports and feature requests

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Acknowledgments

Built for the [Pirates of the Coral-bean Hackathon](https://withcoral.com/hackathon) by [@kulka](https://github.com/kulka).

**Powered by**:
- [Coral](https://withcoral.com) — Cross-source SQL for unified intelligence
- [OSV](https://osv.dev) — Open Source Vulnerabilities database (Google)
- [OpenSSF Scorecard](https://securityscorecards.dev) — Security health metrics (Linux Foundation)
- [EPSS](https://www.first.org/epss/) — Exploit Prediction Scoring System (FIRST)
- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) — Known Exploited Vulnerabilities catalog

**Inspired by**:
- The Log4Shell incident (CVE-2021-44228) that affected 40% of Java applications
- The colors.js/faker.js sabotage that broke 250M+ weekly downloads
- Every developer who's stared at 200 npm audit warnings and thought "where do I even start?"

---

## Support

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/shipwatch/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/shipwatch/discussions)
- **Email**: your-email@example.com

---

<p align="center">
  <strong>Know what's in your supply chain. Fix what matters.</strong>
</p>

<p align="center">
  <a href="https://github.com/YOUR_USERNAME/shipwatch">⭐ Star on GitHub</a> •
  <a href="https://shipwatch.example.com">🚀 Try the Demo</a> •
  <a href="./SCORING.md">📊 Scoring Methodology</a>
</p>
