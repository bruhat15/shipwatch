# ShipWatch × Coral MCP Integration

Query your supply chain data directly from Claude Code, Cursor, or any MCP-compatible IDE using Coral's built-in MCP server.

---

## How It Works

```
ShipWatch scan completes
         ↓
Backend exposes JSON results via /api/results/{scan_id}
         ↓
Coral reads JSON via shipwatch.yaml source spec
         ↓
coral mcp-stdio exposes scan data as an MCP tool
         ↓
Your IDE (Claude Code / Cursor) can query it with natural language
```

---

## Prerequisites

Install Coral CLI:

```bash
# macOS / Linux
curl -fsSL https://withcoral.com/install.sh | sh

# Windows (PowerShell)
irm https://withcoral.com/install.ps1 | iex

# Or via npm
npm install -g @withcoral/cli
```

Verify installation:

```bash
coral --version
```

---

## Setup (one-time)

### Step 1: Register the ShipWatch source

```bash
# From the project root (or anywhere — use the absolute path)
coral source add --file ./backend/coral_specs/shipwatch.yaml
```

Optional: register EPSS and KEV sources for raw threat intel queries:

```bash
coral source add --file ./backend/coral_specs/epss.yaml
coral source add --file ./backend/coral_specs/kev.yaml
```

This registers the `shipwatch` source globally. You can verify with:

```bash
coral source list
```

### Step 2: Start a scan (if you haven't already)

```bash
curl -s -X POST http://localhost:8000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/expressjs/express"}' | python -m json.tool
```

Note the `scan_id` returned (e.g. `55c2294a`).

### Step 3: Start the Coral MCP server

```bash
coral mcp-stdio
```

Leave this running. Configure your IDE to connect to it (see below).

---

## Configure Your IDE

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "coral": {
      "command": "coral",
      "args": ["mcp-stdio"],
      "env": {}
    }
  }
}
```

### Cursor

In Cursor settings → MCP → Add Server:

```
Command: coral
Args: mcp-stdio
```

---

## Example Queries

Once your IDE is connected, you can ask natural language questions about your scan:

### Find all critical packages
```sql
SELECT name, version, risk_score, highest_severity
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND risk_level = 'critical'
ORDER BY risk_score DESC
```

Or in natural language: **"Which packages in scan 55c2294a are critical?"**

### Find unpatched high-severity CVEs
```sql
SELECT name, version, vuln_count, highest_severity, risk_score
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND vuln_count > 0
  AND highest_severity IN ('CRITICAL', 'HIGH')
ORDER BY risk_score DESC
```

### Find packages with poor OpenSSF Scorecard scores
```sql
SELECT name, scorecard_score, maintenance_risk, last_commit
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND scorecard_score IS NOT NULL
ORDER BY scorecard_score ASC
LIMIT 10
```

### Find single-maintainer packages (bus-factor risk)
```sql
SELECT name, maintainers_count, weekly_downloads, risk_level
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND maintainers_count <= 1
ORDER BY weekly_downloads DESC
```

### Find GPL / copyleft licenses
```sql
SELECT name, version, license, risk_score
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND (license LIKE '%GPL%' OR license LIKE '%AGPL%')
```

### Risk summary for a scan
```sql
SELECT
  risk_level,
  COUNT(*) AS package_count,
  ROUND(AVG(risk_score), 2) AS avg_risk_score,
  MAX(risk_score) AS max_risk_score,
  SUM(vuln_count) AS total_vulns
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
GROUP BY risk_level
ORDER BY avg_risk_score DESC
```

### Find deprecated packages still in use
```sql
SELECT name, version, weekly_downloads
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND deprecated = true
ORDER BY weekly_downloads DESC
```

### Decision intelligence: Fix Now items
```sql
SELECT name, decision_action, epss_max_score, in_kev, risk_score
FROM shipwatch.scans
WHERE scan_id = '55c2294a'
  AND decision_action = 'fix_now'
ORDER BY epss_max_score DESC NULLS LAST
```

---

## Source Spec Reference

The `backend/coral_specs/shipwatch.yaml` file defines the Coral source. Key columns:

| Column | Type | Description |
|--------|------|-------------|
| `scan_id` | Utf8 | Unique scan identifier |
| `name` | Utf8 | npm package name |
| `version` | Utf8 | Declared version |
| `risk_level` | Utf8 | `critical` / `warning` / `healthy` |
| `risk_score` | Float64 | 0.0–10.0 composite score |
| `confidence` | Utf8 | `high` / `medium` / `low` |
| `vuln_count` | Int64 | Known CVE count |
| `highest_severity` | Utf8 | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` |
| `license` | Utf8 | SPDX identifier |
| `weekly_downloads` | Int64 | npm weekly downloads |
| `stars` | Int64 | GitHub stars |
| `last_commit` | Utf8 | ISO 8601 timestamp |
| `contributors_count` | Int64 | GitHub contributors |
| `scorecard_score` | Float64 | OpenSSF Scorecard (0–10) |
| `deprecated` | Boolean | npm deprecated flag |
| `maintainers_count` | Int64 | npm maintainer count |
| `security_risk` | Float64 | Security sub-score (0–10) |
| `maintenance_risk` | Float64 | Maintenance sub-score (0–10) |
| `ecosystem_risk` | Float64 | Ecosystem sub-score (0–10) |
| `dep_type` | Utf8 | `production` or `dev` dependency |
| `epss_max_score` | Float64 | Max EPSS score across CVEs |
| `in_kev` | Boolean | Any vulnerability in KEV |
| `kev_ransomware` | Boolean | KEV ransomware indicator |
| `decision_action` | Utf8 | `fix_now` / `watch` / `ignore` |
| `decision_confidence` | Utf8 | Decision confidence |

## Also: Download Scan Data

Download the full scan as a flat JSON file (one package per line — JSONL/NDJSON):

```bash
# Download JSONL for a specific scan
curl -o scan.jsonl http://localhost:8000/api/export/jsonl/{scan_id}

# View the raw JSON results
curl http://localhost:8000/api/results/{scan_id} | python -m json.tool
```

---

## Deployment Notes

If you deploy ShipWatch, update `base_url` in `backend/coral_specs/shipwatch.yaml` to your deployed backend URL:

```yaml
base_url: https://api.yourdomain.com
```

Then re-register the source:

```bash
coral source remove shipwatch
coral source add --file ./backend/coral_specs/shipwatch.yaml
```

---

*Powered by [Coral](https://withcoral.com) — The universal SQL layer for APIs and files.*
