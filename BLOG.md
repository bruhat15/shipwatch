# Captain's Log: Building ShipWatch with Coral

> A reproducible guide to building an open source supply chain intelligence agent using Coral's cross-source SQL runtime.

---

## The Problem I Wanted to Solve

In December 2021, the **Log4Shell** vulnerability (CVE-2021-44228) shook the entire software industry. A critical flaw in a single Java logging library — `log4j` — gave attackers remote code execution across millions of systems. Companies scrambled to figure out: *do we even use this?*

A year later, the maintainer of `colors.js` and `faker.js` — packages downloaded **250 million times per week** — intentionally corrupted them in protest, breaking thousands of production applications overnight.

These aren't isolated incidents. They're symptoms of a fundamental blindspot: **we don't know what's in our supply chain**.

Existing tools check one dimension:
- **Snyk/Dependabot** scan for known CVEs
- **GitHub Insights** show commit activity
- **npm audit** checks for advisories

But none of them answer the full question: *Is this package safe, maintained, and healthy?*

I wanted to build a tool that answers all three at once.

---

## Why Coral Was the Perfect Fit

The insight that unlocked ShipWatch was realizing that the data I needed lives in **three different places**:

| Data Source | What It Tells Me | API |
|-------------|-----------------|-----|
| **GitHub** | Is anyone still maintaining this? How many contributors? | `api.github.com` |
| **OSV** | Does it have known security vulnerabilities? | `api.osv.dev` |
| **npm Registry** | How many people use it? Who maintains it? Is it deprecated? | `registry.npmjs.org` |

Without Coral, I'd need to:
1. Call the GitHub API
2. Parse the JSON
3. Call the OSV API
4. Parse more JSON
5. Call the npm API
6. Parse even more JSON
7. Write glue code to combine the results
8. Repeat for every single dependency

With Coral, I can write **one SQL query**:

```sql
SELECT
    npm.name            AS package,
    gh.pushed_at        AS last_commit,
    osv.severity        AS vuln_severity,
    npm.weekly_downloads AS downloads
FROM npm.packages npm
LEFT JOIN github.repos gh ON gh.full_name = npm.repository_url
LEFT JOIN osv.vulnerabilities osv ON osv.package_name = npm.name
WHERE osv.severity IN ('CRITICAL', 'HIGH')
   OR gh.pushed_at < '2025-01-01'
ORDER BY osv.severity;
```

Coral translates this into the right API calls, handles pagination, and returns unified results. **One query, three data sources, zero glue code.**

---

## Writing Custom Source Specs

Coral ships with a GitHub source, but I needed OSV and npm support. So I wrote two custom source specs.

### OSV Source Spec

The OSV API uses POST requests with a JSON body. My spec maps this to SQL:

```yaml
name: osv
dsl_version: 3
backend: http
base_url: https://api.osv.dev

tables:
  - name: vulnerabilities
    filters:
      - name: package_name
        required: true
      - name: ecosystem
        required: true
    request:
      method: POST
      path: /v1/query
      body:
        - path: [package, name]
          from: filter
          key: package_name
        - path: [package, ecosystem]
          from: filter
          key: ecosystem
    response:
      rows_path: [vulns]
    columns:
      - name: id
        type: Utf8
        expr: { kind: path, path: [id] }
      - name: severity
        type: Utf8
        expr: { kind: path, path: [database_specific, severity] }
      # ... more columns
```

The key insight: `filters` become `WHERE` clauses in SQL, and `body` mappings tell Coral how to construct the POST request from those filters. Pagination is handled via `cursor_body` mode since OSV uses cursor tokens.

### npm Registry Source Spec

The npm API is simpler — GET requests with the package name in the URL path:

```yaml
request:
  method: GET
  path: /{{filter.name}}
```

One tricky part: the `deprecated` field only exists on packages that ARE deprecated. I used `if_present` to handle this cleanly:

```yaml
- name: deprecated
  type: Boolean
  expr:
    kind: if_present
    check: { kind: path, path: [deprecated] }
    then_value: "true"
```

After writing both specs, I validated them:
```bash
coral source lint ./osv.yaml   # ✓ No errors
coral source lint ./npm.yaml   # ✓ No errors
coral source add --file ./osv.yaml
coral source add --file ./npm.yaml
```

And tested with real queries:
```bash
coral sql "SELECT id, summary, severity FROM osv.vulnerabilities WHERE package_name = 'lodash' AND ecosystem = 'npm' LIMIT 5"
```

It worked. OSV data, queried as SQL, through Coral. Beautiful.

---

## The Architecture

ShipWatch has three layers:

1. **Next.js Frontend** — landing page with repo URL input, scan dashboard with risk visualization
2. **FastAPI Backend** — orchestrates the scan pipeline: parse deps → query Coral → score risks → AI summarize
3. **Coral Runtime** — translates SQL into API calls across GitHub + OSV + npm

The scan pipeline runs in 5 steps:
1. **Parse**: Fetch `package.json` from GitHub, extract all dependencies
2. **Enrich**: For each dependency, query npm (license, downloads, maintainers), GitHub (stars, issues, last commit), and OSV (vulnerabilities) — **10 concurrent** using asyncio
3. **Score**: Apply a weighted risk algorithm: Security (40%) + Maintenance (35%) + Ecosystem (25%)
4. **Summarize**: Send risky packages to Gemini 2.5 Flash for plain-English analysis
5. **Deliver**: Return results to the frontend dashboard

---

## The Risk Scoring Algorithm

I wanted something more nuanced than "has CVE = bad." My algorithm considers three dimensions:

**Security (40% weight)**
- CRITICAL CVE: +100 points
- HIGH CVE: +70 points
- Multiple CVEs: +20 per additional
- No fix available: +30 bonus

**Maintenance (35% weight)**
- No commits in 12+ months: +80 points
- 500+ open issues: +40 points
- Single contributor (bus factor = 1): +60 points

**Ecosystem (25% weight)**
- Deprecated on npm: +100 points
- Under 1000 downloads/month: +30 points
- No license: +30 points
- Single maintainer: +30 points

Final score ≥ 150 → 🔴 Critical. Score ≥ 70 → 🟡 Warning. Below → 🟢 Healthy.

---

## What I Learned

1. **Cross-source JOINs are the superpower.** The ability to ask "show me packages that have a CRITICAL CVE AND haven't been updated in a year AND have declining downloads" in a single query is genuinely new. No API wrapper gives you this.

2. **Writing source specs is like building LEGO.** Once you understand the DSL v3 format (filters → request mapping → response extraction → column expressions), you can connect any REST API to Coral in under an hour.

3. **Supply chain risk is multidimensional.** A package with zero CVEs but one maintainer who hasn't committed in 14 months is arguably riskier than a popular package with a patched MEDIUM vulnerability. ShipWatch's scoring captures this nuance.

4. **Coral's fallback architecture is elegant.** I built the backend so it works with OR without Coral installed — using direct API calls as fallbacks. But with Coral, the cross-source JOINs unlock analysis that's impossible otherwise.

---

## Try It Yourself

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/shipwatch.git
cd shipwatch

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Add your GitHub token + Gemini key
python main.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev

# Coral setup
coral source add github
coral source add --file ./backend/coral_specs/osv.yaml
coral source add --file ./backend/coral_specs/npm.yaml

# Open http://localhost:3000 and scan!
```

---

*Built for the Pirates of the Coral-bean hackathon by WeMakeDevs. Powered by [Coral](https://withcoral.com).*
