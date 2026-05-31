# ShipWatch — Master Implementation Plan

> **SELF-CONTAINED**: Any AI agent or human should be able to pick this up cold and execute.  
> **Last Updated**: May 30, 2026  
> **Deadline**: May 31, 2026  
> **Status**: Phases A-C, D, E, F, G, H, I, K, L, M complete. Phase J (MCP) complete with audit fixes. **Phase O (Decision Intelligence)** is next. Phase N (screenshots/demo video) is final.
> **Note**: E3 blog content targets completed in `frontend/src/data/blog-posts.ts`.

---

## Architecture Overview

```
Frontend (Next.js 15 + TypeScript + Tailwind v4)
  ├── / ........................ Landing page (public)
  ├── /features ................ Features showcase (public)
  ├── /blog .................... Blog listing (public)
  ├── /blog/[slug] ............. Individual blog post (public)
  ├── /contact ................. Contact form (public)
  ├── /auth/signin ............. Sign in (GitHub/Google OAuth)
  ├── /dashboard ............... User dashboard (authenticated)
  ├── /scan/[id] ............... Scan results (authenticated)
  └── /compare ................. Compare repos (authenticated, IF TIME)

Backend (FastAPI + Python 3.10+)
  ├── /api/auth/* .............. OAuth flows
  ├── /api/scan ................ Start scan (POST)
  ├── /api/scan/{id}/stream .... SSE streaming results (GET)
  ├── /api/results/{id} ........ Get scan results (GET)
  ├── /api/user/scans .......... User's scan history (GET)
  ├── /api/user/policies ....... User's policy rules (GET/POST)
  ├── /api/remediation/{id} .... Remediation checklist (GET/PATCH)
  ├── /api/github/issue ........ Create GitHub issue (POST)
  ├── /api/badge/{id} .......... SVG badge generator (GET)
  ├── /api/export/sbom/{id} .... CycloneDX SBOM export (GET)
  ├── /api/export/md/{id} ...... Markdown report (GET)
  ├── /api/contact ............. Contact form handler (POST)
  └── /api/health .............. Health check (GET)

Data: SQLite (shipwatch.db)
AI: Gemini 2.5 Flash (free tier)
Scoring: CVSS (NIST) + OpenSSF Scorecard API (free)
```

## Implementation Highlights Completed So Far

- OAuth sign-in and provider linking for GitHub and Google, with JWT-based auth and linked user history.
- Live SSE scan streaming with partial result persistence so `/api/results/{id}` shows progress as packages arrive.
- Upgrade path generation so risky packages include actionable fix commands.
- Risk scoring overhaul with CVSS-grounded package scores, OpenSSF Scorecard support, and aggregate scan scoring.
- Preloaded demo cache plus homepage demo cards so the landing page can show real cached scans.
- Landing page and demo card UI polish, including improved layout, controls, and dark-mode contrast fixes.

---

# PHASE D: Authentication & User System

> **Time estimate**: ~3-4 hours  
> **Priority**: HIGH — blocks dashboard, scan history, and all personalized features

## D1: Backend Auth Setup

### File: `backend/auth.py` (NEW)

**What it does**: Handles GitHub and Google OAuth flows, JWT token generation.

**Implementation**:

1. **Install dependencies**:
```bash
pip install python-jose[cryptography] passlib python-multipart httpx
```
Add to `requirements.txt`: `python-jose[cryptography]`, `passlib`, `httpx`

2. **Environment variables** (add to `.env`):
```env
# GitHub OAuth App — create at https://github.com/settings/developers
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
# Google OAuth — create at https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
# JWT
JWT_SECRET=generate_a_random_32_char_string
FRONTEND_URL=http://localhost:3000
```

3. **GitHub OAuth flow**:
```
Frontend → GET /api/auth/github → redirect to github.com/login/oauth/authorize
GitHub → redirect to /api/auth/github/callback?code=XYZ
Backend → POST https://github.com/login/oauth/access_token (exchange code for token)
Backend → GET https://api.github.com/user (get user info)
Backend → create/update user in DB → generate JWT → redirect to frontend with token
```

4. **Google OAuth flow**: Same pattern but with:
```
Auth URL: https://accounts.google.com/o/oauth2/v2/auth
Token URL: https://oauth2.googleapis.com/token
User info: https://www.googleapis.com/oauth2/v2/userinfo
```

5. **JWT middleware**: Create `get_current_user()` dependency that extracts user from JWT in `Authorization: Bearer <token>` header.

6. **User model in SQLite**:
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,        -- UUID
    github_id TEXT UNIQUE,
    google_id TEXT UNIQUE,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    github_token TEXT,          -- for creating issues later
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

7. **Add `user_id` column to scans table**:
```sql
ALTER TABLE scans ADD COLUMN user_id TEXT REFERENCES users(id);
```

### File: `backend/main.py` (MODIFY)

- Add auth routes: `app.include_router(auth_router, prefix="/api/auth")`
- Protect scan endpoints with `Depends(get_current_user)`
- Add `/api/user/scans` endpoint that returns scans filtered by `user_id`
- Keep `/api/health` and public scan results accessible without auth (for badges/demos)

## D2: Frontend Auth Setup

### File: `frontend/src/lib/auth.ts` (NEW)

**What it does**: Auth context provider, token storage, login/logout functions.

```typescript
// Store JWT in localStorage
// Provide useAuth() hook: { user, isLoggedIn, login, logout }
// login(provider: 'github' | 'google') → redirect to backend OAuth URL
// On callback page, extract token from URL, store it
// Attach token to all API calls via headers
```

### File: `frontend/src/app/auth/callback/page.tsx` (NEW)

**What it does**: OAuth callback handler. Extracts JWT token from URL query params, stores in localStorage, redirects to `/dashboard`.

### File: `frontend/src/components/Navbar.tsx` (NEW)

**What it does**: Shared navbar across all pages. Shows:
- Logo + "ShipWatch"
- Nav links: Features, Blog, Contact
- If logged in: avatar + dropdown (Dashboard, Sign Out)
- If not logged in: "Sign In" button

### File: `frontend/src/app/layout.tsx` (MODIFY)

- Wrap app with `AuthProvider`
- Include `<Navbar />` on all pages

---

# PHASE E: Landing Page & Content Pages

> **Time estimate**: ~4-5 hours  
> **Priority**: HIGH — first impression for judges and users

## E1: Landing Page Redesign

### File: `frontend/src/app/page.tsx` (REWRITE)

**Design philosophy**: Professional product page, NOT a "Coral demo." Remove excessive Coral branding. Keep it as "Powered by Coral" in footer only.

**Sections (top to bottom)**:

1. **Hero Section**
   - Headline: "Know What's In Your Supply Chain"
   - Subheadline: "Scan, score, and fix dependency risks in 30 seconds. Backed by CVSS, OpenSSF Scorecard, and cross-source intelligence."
   - CTA button: "Get Started Free" → `/auth/signin`
   - Secondary CTA: "See a Demo" → scrolls to demo section or shows pre-loaded scan
   - Subtle gradient background (dark theme), NO spinning gradient borders
   - Light animation: cards fade in on scroll, slight parallax on background blobs

2. **Social Proof / Stats Bar**
   - "3 data sources unified" | "CVSS-backed scoring" | "30-second scans" | "CycloneDX export"
   - Simple horizontal bar, subtle glassmorphism

3. **How It Works (3 Steps)**
   - Step 1: "Paste a GitHub URL" — icon of link
   - Step 2: "Watch live analysis" — icon of streaming data
   - Step 3: "Get actionable fixes" — icon of checkmark
   - Each step is a card with a small illustration or icon
   - Animate on scroll (fade-up, stagger)

4. **Feature Highlights (Grid)**
   - "Live Scanning" — watch results stream in real-time
   - "Actionable Fixes" — copy-paste upgrade commands
   - "CVSS-Based Scoring" — industry-standard risk assessment
   - "SBOM Export" — CycloneDX for enterprise compliance
   - "CI/CD Integration" — GitHub Actions gate
   - "IDE Queryable" — query scan data from Claude Code/Cursor via MCP
   - Each card: icon + title + 1-line description
   - Use a 2×3 or 3×2 grid

5. **Interactive Demo Preview**
   - Embedded preview of the scan dashboard with pre-loaded data
   - "Try scanning expressjs/express →" link that actually works (uses cached data)
   - Screenshot or live iframe of the dashboard

6. **Blog Previews (3 cards)**
   - Show latest 3 blog posts with title, excerpt, read time
   - "Read More →" links to `/blog/[slug]`

7. **CTA Section**
   - "Protect Your Supply Chain" + "Get Started Free" button
   - "View on GitHub" link (secondary)

8. **Footer**
   - Links: Features, Blog, Contact, GitHub
   - "Powered by Coral" (small, professional — NOT the hero text)
   - © 2026 ShipWatch

**CSS/Animation guidelines**:
- Use `@keyframes fadeUp` for scroll-triggered animations (IntersectionObserver)
- NO spinning borders, NO excessive glows
- Subtle hover states (scale 1.02, shadow increase)
- Color palette: dark bg (#0a0a0a), cyan accents (#22d3ee), blue accents (#3b82f6)
- Cards: glassmorphism (`bg-white/5 backdrop-blur border border-white/10`)
- Typography: Inter for body, JetBrains Mono for code

## E2: Features Page

### File: `frontend/src/app/features/page.tsx` (NEW)

**Sections**:
1. Hero: "Everything You Need to Secure Your Dependencies"
2. Feature deep-dives (one section per feature with more detail than landing page):
   - Live Scanning (SSE) — screenshot + explanation
   - Risk Scoring — explain the 3 dimensions, link to SCORING.md
   - Fix Recommendations — show example fix card
   - GitHub Issue Creation — screenshot of generated issue
   - Policy Engine — screenshot of policy rules
   - SBOM Export — explain CycloneDX
   - CI Gate — show the GitHub Action YAML
   - MCP Integration — explain IDE querying
3. CTA: "Start Scanning" → `/auth/signin`

## E3: Blog System

### File: `frontend/src/app/blog/page.tsx` (NEW)

**What it does**: Lists all blog posts from a local data file. Each card shows title, excerpt, date, read time, category tag.

### File: `frontend/src/app/blog/[slug]/page.tsx` (NEW)

**What it does**: Renders individual blog post. Content is stored as MDX or plain data objects.

### File: `frontend/src/data/blog-posts.ts` (NEW)

**Blog posts to write** (store as data objects with `title`, `slug`, `excerpt`, `content`, `date`, `readTime`, `category`):
> **Completed** — all listed posts are present in the blog data file.

1. **"The Log4Shell Wake-Up Call: Why Your Dependencies Are Your Weakest Link"**
   - Category: Incidents
   - Content: log4j (CVE-2021-44228) story. 40% of Java apps affected. How one library broke the internet. Cite CISA advisory.
   - CTA: "Scan your repos now"

2. **"colors.js and faker.js: When a Maintainer Goes Rogue"**
   - Category: Incidents
   - Content: Marak Squires sabotage. 250M downloads/week packages corrupted. Supply chain attacks from the inside.
   - CTA: "ShipWatch checks maintainer health"

3. **"I'm a Student, Not a Security Expert. Why Should I Care?"**
   - Category: Guide
   - Content: Written for beginners. Your `package.json` has 200+ transitive deps you didn't choose. Any one could be compromised. Real examples at student project scale. How `npm install react` brings in 30+ packages. Why "it works on my machine" ≠ safe.
   - CTA: "It takes 30 seconds to scan"

4. **"How ShipWatch Scores Your Dependencies (And Why You Should Trust It)"**
   - Category: Technical
   - Content: Explain the CVSS + OpenSSF Scorecard methodology. Why it's defensible. Link to SCORING.md.
   - CTA: "See your score"

5. **"Building ShipWatch: Captain's Log"** (the hackathon blog — Keychron bounty)
  - Already exists as BLOG.md, repurpose into the blog system

## E4: Contact Page

### File: `frontend/src/app/contact/page.tsx` (NEW)

**What it does**: Simple contact form that sends an email.

**Implementation options** (pick one):
- **Option A**: Use [EmailJS](https://www.emailjs.com/) — free tier, sends emails from frontend directly. No backend needed. 200 emails/month free.
  - `npm install @emailjs/browser`
  - Create account at emailjs.com, set up email template
  - Frontend form → `emailjs.send(serviceId, templateId, { name, email, message })`
  
- **Option B**: Backend endpoint `/api/contact` that sends email via SMTP.
  - Use `smtplib` in Python
  - Requires SMTP credentials in `.env`

**Form fields**: Name, Email, Message, Submit button. Success/error toast notification.

---

# PHASE F: SSE Streaming Scan (Live Results)

> **Time estimate**: ~3 hours  
> **Priority**: MUST DO — transforms UX from boring to engaging

## F1: Backend SSE Endpoint

### File: `backend/main.py` (MODIFY)

**What to add**: New endpoint `GET /api/scan/{id}/stream` that uses `StreamingResponse` with `text/event-stream` content type.

**How SSE works**:
```python
from fastapi.responses import StreamingResponse
import asyncio, json

@app.get("/api/scan/{id}/stream")
async def stream_scan(id: str):
    async def event_generator():
        # Poll the scan store for updates
        last_count = 0
        while True:
            scan = store.get_scan(id)
            if not scan:
                yield f"event: error\ndata: {json.dumps({'message': 'Scan not found'})}\n\n"
                break
            
            packages = scan.get("packages", [])
            # Send new packages since last check
            if len(packages) > last_count:
                for pkg in packages[last_count:]:
                    yield f"event: package\ndata: {json.dumps(pkg)}\n\n"
                last_count = len(packages)
            
            # Send status updates
            yield f"event: status\ndata: {json.dumps({'status': scan['status'], 'total': len(packages)})}\n\n"
            
            if scan["status"] in ("complete", "error"):
                yield f"event: done\ndata: {json.dumps(scan)}\n\n"
                break
            
            await asyncio.sleep(0.5)  # Poll every 500ms
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

**Also modify `run_scan_pipeline()`** to save each package to the store AS it's enriched (not all at once at the end). This requires changing the enrichment loop to call `store.add_package(scan_id, pkg)` after each package completes.

## F2: Frontend SSE Consumer

### File: `frontend/src/app/scan/[id]/page.tsx` (MODIFY)

**Replace the polling-based approach** with EventSource:

```typescript
useEffect(() => {
  const eventSource = new EventSource(`${API_BASE}/api/scan/${id}/stream`);
  
  eventSource.addEventListener('package', (e) => {
    const pkg = JSON.parse(e.data);
    setPackages(prev => [...prev, pkg]);
    // Package appears on screen immediately
  });
  
  eventSource.addEventListener('status', (e) => {
    const { status, total } = JSON.parse(e.data);
    setStatus(status);
    setProgress(total);
  });
  
  eventSource.addEventListener('done', (e) => {
    const finalResult = JSON.parse(e.data);
    setResult(finalResult);
    eventSource.close();
  });
  
  return () => eventSource.close();
}, [id]);
```

**UI during streaming**:
- Show a live count: "Analyzed 12 / 44 packages"
- Each package row appears with a fade-in animation as it arrives
- Critical packages get a pulse animation when they appear
- Show "Sources: GitHub ✓ | OSV ✓ | npm ✓" status indicators
- Progress bar fills as packages complete

---

# PHASE G: Upgrade Path Generator (Actionable Fixes)

> **Time estimate**: ~1.5 hours  
> **Priority**: MUST DO — transforms report into action

## G1: Backend Fix Generator

### File: `backend/services/fix_generator.py` (NEW)

**What it does**: For each risky package, generate a specific fix action.

```python
def generate_fixes(package: dict) -> list[dict]:
    """Generate actionable fix recommendations for a package."""
    fixes = []
    
    # 1. CVE with fixed version → upgrade command
    for vuln in package.get("vulnerabilities", []):
        if vuln.get("fixed_version"):
            fixes.append({
                "type": "upgrade",
                "urgency": "now" if vuln.get("severity") in ("CRITICAL", "HIGH") else "soon",
                "title": f"Fix {vuln['id']}",
                "description": f"Upgrade {package['name']} to {vuln['fixed_version']} to patch {vuln['id']} ({vuln.get('severity', 'UNKNOWN')} severity)",
                "command": f"npm install {package['name']}@{vuln['fixed_version']}",
                "vuln_id": vuln["id"],
            })
    
    # 2. Deprecated package → migration
    if package.get("deprecated"):
        fixes.append({
            "type": "migrate",
            "urgency": "soon",
            "title": f"Migrate from {package['name']}",
            "description": f"{package['name']} is deprecated on npm. Find an actively maintained alternative.",
            "command": None,
        })
    
    # 3. Stale package → monitor or fork
    last_commit = package.get("last_commit")
    if last_commit:
        from datetime import datetime, timezone
        try:
            lc = datetime.fromisoformat(last_commit.replace("Z", "+00:00"))
            days = (datetime.now(timezone.utc) - lc).days
            if days > 365:
                fixes.append({
                    "type": "monitor",
                    "urgency": "later",
                    "title": f"Monitor {package['name']}",
                    "description": f"No commits in {days} days. Consider finding an alternative or forking.",
                    "command": None,
                })
        except (ValueError, TypeError):
            pass
    
    # 4. License issue → review
    for issue in package.get("license_issues", []):
        fixes.append({
            "type": "review",
            "urgency": "soon" if issue["severity"] == "critical" else "later",
            "title": f"License: {issue['type']}",
            "description": issue["message"],
            "command": None,
        })
    
    return fixes
```

## G2: Integrate into Pipeline

### File: `backend/main.py` (MODIFY)

After scoring, call `generate_fixes()` for each package and add the `fixes` field to the package dict. Add `fixes: list[dict] = []` to the `PackageRisk` model.

## G3: Frontend Fix Cards

### File: `frontend/src/app/scan/[id]/page.tsx` (MODIFY)

In the expanded package detail, add a "Fixes" section:

```tsx
{pkg.fixes && pkg.fixes.length > 0 && (
  <div className="mt-3">
    <h4 className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Recommended Actions</h4>
    {pkg.fixes.map((fix, i) => (
      <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-neutral-800/30 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
          fix.urgency === 'now' ? 'bg-red-500/10 text-red-400' :
          fix.urgency === 'soon' ? 'bg-amber-500/10 text-amber-400' :
          'bg-blue-500/10 text-blue-400'
        }`}>{fix.urgency.toUpperCase()}</span>
        <div className="flex-1">
          <p className="text-xs text-neutral-200 font-medium">{fix.title}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{fix.description}</p>
          {fix.command && (
            <div className="mt-1.5 flex items-center gap-2">
              <code className="text-xs bg-neutral-900 px-2 py-1 rounded text-cyan-400 font-mono">
                {fix.command}
              </code>
              <button onClick={() => navigator.clipboard.writeText(fix.command)}
                className="text-xs text-neutral-500 hover:text-neutral-300">
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
)}
```

---

# PHASE H: Risk Scoring Overhaul

> **Time estimate**: ~1.5 hours  
> **Priority**: MUST DO — makes scores defensible in judge Q&A

## H1: Rewrite Scorer

### File: `backend/services/risk_scorer.py` (REWRITE)

**New methodology** (0-10 scale, CVSS-grounded):

```python
import math
from datetime import datetime, timezone

def score_package(dep: dict) -> dict:
    """Score a single package on 0-10 risk scale. 10 = most risky."""
    
    security = _security_risk(dep)
    maintenance = _maintenance_risk(dep)
    ecosystem = _ecosystem_risk(dep)
    
    # Weighted composite
    composite = round(0.40 * security + 0.35 * maintenance + 0.25 * ecosystem, 1)
    
    # Hard override: CVSS >= 9.0 forces Critical
    has_critical_cvss = any(
        v.get("cvss_score", 0) >= 9.0 or v.get("severity") == "CRITICAL"
        for v in dep.get("vulnerabilities", [])
    )
    
    if has_critical_cvss or composite >= 6.1:
        risk_level = "critical"
    elif composite >= 3.1:
        risk_level = "warning"
    else:
        risk_level = "healthy"
    
    # Confidence
    dims_with_data = sum([
        security > 0 or len(dep.get("vulnerabilities", [])) > 0,  # security has data
        dep.get("last_commit") is not None or dep.get("scorecard_score") is not None,  # maintenance has data
        dep.get("weekly_downloads") is not None,  # ecosystem has data
    ])
    confidence = ["low", "medium", "high"][min(dims_with_data, 2)]
    
    return {
        **dep,
        "risk_score": composite,
        "risk_level": risk_level,
        "confidence": confidence,
        "_security_risk": round(security, 1),
        "_maintenance_risk": round(maintenance, 1),
        "_ecosystem_risk": round(ecosystem, 1),
    }

def _security_risk(dep: dict) -> float:
    """0-10, higher = more risky. Grounded in CVSS (NIST standard)."""
    vulns = dep.get("vulnerabilities", [])
    if not vulns:
        return 0.0
    
    # Use max CVSS score if available, else map severity label
    max_cvss = 0.0
    for v in vulns:
        if v.get("cvss_score"):
            max_cvss = max(max_cvss, float(v["cvss_score"]))
        else:
            severity_map = {"CRITICAL": 9.5, "HIGH": 7.5, "MEDIUM": 5.0, "LOW": 2.5}
            max_cvss = max(max_cvss, severity_map.get(v.get("severity", ""), 5.0))
    
    # Each additional vuln adds 0.5, capped at +3
    extra = min(len(vulns) - 1, 6) * 0.5
    
    # Unfixed vulns add 1.0
    unfixed = 1.0 if any(not v.get("fixed_version") for v in vulns) else 0.0
    
    return min(max_cvss + extra + unfixed, 10.0)

def _maintenance_risk(dep: dict) -> float:
    """0-10, higher = more risky. Uses OpenSSF Scorecard when available."""
    # Option A: Use Scorecard data if available
    scorecard = dep.get("scorecard_score")
    if scorecard is not None:
        return round(10.0 - float(scorecard), 1)
    
    # Option B: Heuristic fallback
    score = 3.0  # Default moderate risk when data is missing
    
    last_commit = dep.get("last_commit")
    if last_commit:
        try:
            lc = datetime.fromisoformat(str(last_commit).replace("Z", "+00:00"))
            days = (datetime.now(timezone.utc) - lc).days
            if days <= 90: score = 1.0
            elif days <= 180: score = 3.0
            elif days <= 365: score = 5.0
            elif days <= 730: score = 7.0
            else: score = 9.0
        except (ValueError, TypeError):
            pass
    
    # Contributor adjustment
    contribs = dep.get("contributors_count")
    if contribs is not None:
        if contribs <= 1: score = min(score + 1.0, 10.0)
        elif contribs <= 3: score = min(score + 0.5, 10.0)
    
    return score

def _ecosystem_risk(dep: dict) -> float:
    """0-10, higher = more risky. Log-scale for downloads."""
    if dep.get("deprecated"):
        return 10.0
    
    score = 2.0  # Default moderate-low risk
    
    downloads = dep.get("weekly_downloads")
    if downloads is not None and downloads > 0:
        # Log scale: 10M downloads → 0 risk, 100 downloads → 7 risk
        health = min(math.log10(downloads) / 7.0 * 10.0, 10.0)
        score = round(10.0 - health, 1)
    
    # No license
    lic = dep.get("license")
    if not lic or lic in ("UNLICENSED", "NONE", ""):
        score = min(score + 2.0, 10.0)
    
    # Single maintainer
    maintainers = dep.get("maintainers_count")
    if maintainers is not None and maintainers <= 1:
        score = min(score + 1.5, 10.0)
    
    return score
```

## H2: OpenSSF Scorecard API Integration

### File: `backend/services/coral_client.py` (MODIFY)

Add a new method to query the free Scorecard API:

```python
async def query_scorecard(self, owner: str, repo: str) -> float | None:
    """Query OpenSSF Scorecard API. Returns 0-10 score or None."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.securityscorecards.dev/projects/github.com/{owner}/{repo}"
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("score")  # 0-10 float
    except Exception:
        pass
    return None
```

Call this during the enrichment pipeline (alongside npm/GitHub/OSV) and store as `scorecard_score` on the package dict.

## H3: SCORING.md

### File: `SCORING.md` (NEW, in project root)

Write a 1-page document explaining:
- The 3 dimensions (Security, Maintenance, Ecosystem)
- How each is scored 0-10
- The CVSS grounding for security
- The OpenSSF Scorecard integration for maintenance
- The log-scale normalization for downloads
- Why the weights are 40/35/25
- The threshold definitions (0-3 healthy, 3.1-6 warning, 6.1-10 critical)
- The hard override for CVSS ≥ 9.0
- The confidence indicator

This is your defense if a judge asks "why those numbers?"

---

# PHASE I: Actionable Remediation Features (Point 6)

> **Time estimate**: ~4-5 hours total  
> **Priority**: HIGH — this is what makes users feel they're STOPPING vulnerabilities

## I1: GitHub Issue Creation (~1.5h)

### File: `backend/main.py` (MODIFY)

Add endpoint `POST /api/github/issue`:

```python
@app.post("/api/github/issue")
async def create_github_issue(
    repo_url: str,
    package_name: str,
    scan_id: str,
    user = Depends(get_current_user)
):
    """Create a GitHub issue on the user's repo for a critical vulnerability."""
    # Extract owner/repo from URL
    # Use user's stored github_token
    # POST to https://api.github.com/repos/{owner}/{repo}/issues
    # Body: auto-generated from vulnerability data
    # Return: issue URL
```

**Issue template**:
```markdown
## 🔴 Critical Dependency Vulnerability: {package_name}

**Detected by ShipWatch** on {date}

### Vulnerability Details
- **CVE**: {vuln_id}
- **Severity**: {severity} (CVSS {score})
- **Summary**: {summary}

### Recommended Fix
```bash
npm install {package_name}@{fixed_version}
```

### Risk Assessment
- Risk Score: {score}/10
- Confidence: {confidence}

---
*Generated by [ShipWatch](https://github.com/YOUR_USERNAME/shipwatch)*
```

### Frontend: Add "Create Issue" button in package detail

```tsx
<button
  onClick={() => createGitHubIssue(result.repo_url, pkg.name, result.scan_id)}
  className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center gap-1.5"
>
  <GithubIcon className="w-3.5 h-3.5" />
  Create Issue
</button>
```

## I2: Remediation Checklist (~1.5h)

### File: `frontend/src/app/scan/[id]/page.tsx` (MODIFY)

Add a "Remediation Plan" tab/section at the top of the dashboard (above the package list):

```tsx
// Aggregate all fixes across all packages
const allFixes = result.packages
  .flatMap(pkg => (pkg.fixes || []).map(f => ({ ...f, packageName: pkg.name })))
  .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

// Show as an interactive checklist
<div className="glass-card p-6 mb-6">
  <h3 className="font-semibold text-neutral-100 mb-4">
    Remediation Plan 
    <span className="text-neutral-500 font-normal ml-2">
      {checkedCount}/{allFixes.length} resolved
    </span>
  </h3>
  <div className="w-full h-2 rounded-full bg-neutral-800 mb-4">
    <div className="h-full rounded-full bg-green-500 transition-all"
      style={{ width: `${(checkedCount / allFixes.length) * 100}%` }} />
  </div>
  {allFixes.map((fix, i) => (
    <label key={i} className="flex items-start gap-3 py-2 cursor-pointer group">
      <input type="checkbox" 
        checked={checked[i]} 
        onChange={() => toggleCheck(i)}
        className="mt-0.5 accent-cyan-500" />
      <div className={checked[i] ? "line-through text-neutral-600" : ""}>
        <span className="text-xs font-medium text-neutral-200">
          {fix.packageName}: {fix.title}
        </span>
        {fix.command && (
          <code className="block text-xs text-cyan-400 font-mono mt-0.5">
            {fix.command}
          </code>
        )}
      </div>
    </label>
  ))}
</div>
```

Save checklist state in localStorage (keyed by scan_id) so it persists across page refreshes.

## I3: Security Badge Generator (~1h)

### File: `backend/main.py` (MODIFY)

Add endpoint `GET /api/badge/{scan_id}`:

```python
from fastapi.responses import Response

@app.get("/api/badge/{scan_id}")
async def get_badge(scan_id: str):
    """Return an SVG badge showing the scan's risk score."""
    scan = store.get_scan(scan_id)
    if not scan:
        return Response(content=generate_badge("unknown", "#999"), media_type="image/svg+xml")
    
    score = scan.get("average_score", 0)
    if score <= 3.0:
        color = "#22c55e"  # green
        label = "healthy"
    elif score <= 6.0:
        color = "#f59e0b"  # amber
        label = "warning"
    else:
        color = "#ef4444"  # red
        label = "critical"
    
    svg = generate_badge(f"{score}/10 {label}", color)
    return Response(content=svg, media_type="image/svg+xml",
                    headers={"Cache-Control": "no-cache"})

def generate_badge(text: str, color: str) -> str:
    """Generate a shields.io-style SVG badge."""
    label = "ShipWatch"
    label_width = len(label) * 7 + 10
    value_width = len(text) * 7 + 10
    total_width = label_width + value_width
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20">
  <rect width="{label_width}" height="20" fill="#555" rx="3"/>
  <rect x="{label_width}" width="{value_width}" height="20" fill="{color}" rx="3"/>
  <rect width="{total_width}" height="20" fill="url(#g)" rx="3"/>
  <g fill="#fff" font-family="Verdana" font-size="11">
    <text x="{label_width/2}" y="14" text-anchor="middle">{label}</text>
    <text x="{label_width + value_width/2}" y="14" text-anchor="middle">{text}</text>
  </g>
</svg>'''
```

**Frontend**: Show a "Get Badge" section in scan results with the embed code:
```markdown
![ShipWatch Score](http://localhost:8000/api/badge/{scan_id})
```

## I4: Policy Engine (~1.5h)

### Backend: `backend/services/policy_engine.py` (NEW)

```python
DEFAULT_POLICIES = [
    {"id": "block-critical-cvss", "name": "Block CRITICAL CVEs", 
     "rule": "cvss_score >= 9.0", "action": "block", "enabled": True},
    {"id": "warn-stale", "name": "Warn on stale packages", 
     "rule": "days_since_commit > 365", "action": "warn", "enabled": True},
    {"id": "warn-deprecated", "name": "Warn on deprecated", 
     "rule": "deprecated == true", "action": "warn", "enabled": True},
    {"id": "block-copyleft", "name": "Block copyleft licenses", 
     "rule": "license_type == 'copyleft'", "action": "block", "enabled": False},
    {"id": "warn-single-maintainer", "name": "Warn on single maintainer", 
     "rule": "maintainers_count <= 1", "action": "warn", "enabled": False},
]

def evaluate_policies(package: dict, policies: list[dict]) -> list[dict]:
    """Check a package against policy rules. Return violations."""
    violations = []
    for policy in policies:
        if not policy.get("enabled"):
            continue
        if _evaluate_rule(package, policy["rule"]):
            violations.append({
                "policy_id": policy["id"],
                "policy_name": policy["name"],
                "action": policy["action"],
                "package": package["name"],
            })
    return violations
```

### Frontend: Policy violations section

In the scan dashboard, show a "Policy Violations" panel at the top if any packages violate enabled policies. Use red BLOCK badges and amber WARN badges. This makes users feel like they have a security GATE, not just a report.

Users can toggle policies on/off from a settings panel in their dashboard.

---

# PHASE J: MCP Server Integration

> **Time estimate**: ~3 hours  
> **Priority**: SHOULD DO — impressive Coral-native feature for judges

## J1: Export Scan Results as JSONL

### File: `backend/main.py` (MODIFY)

After a scan completes, export results to `~/.shipwatch/scans/{scan_id}.jsonl`:

```python
import json
from pathlib import Path

def export_scan_jsonl(scan_id: str, packages: list[dict]):
    """Export scan results as JSONL for Coral consumption."""
    output_dir = Path.home() / ".shipwatch" / "scans"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_dir / f"{scan_id}.jsonl", "w") as f:
        for pkg in packages:
            f.write(json.dumps(pkg) + "\n")
```

## J2: Write shipwatch.yaml Coral Source Spec

### File: `backend/coral_specs/shipwatch.yaml` (NEW)

```yaml
    format: jsonl
      - name: name
        type: Utf8
      - name: version
      - name: risk_level
        type: Utf8
      - name: vuln_count
        type: Int64
      - name: highest_severity
        type: Utf8
      - name: license
        type: Utf8
      - name: weekly_downloads
        type: Int64
      - name: last_commit
        type: Utf8
      - name: confidence
        type: Utf8
```

## J3: README Section

Add to README.md:

```markdown
## 🤖 Query from Your IDE (MCP Integration)

After scanning, query your supply chain data directly from Claude Code, Cursor, or any MCP-compatible IDE:

```bash
# Install the ShipWatch source
coral source add --file ./backend/coral_specs/shipwatch.yaml

# Start Coral MCP server
coral mcp-stdio

# Now in your IDE, ask:
# "Which of my packages have unpatched critical CVEs?"
# "Show me all packages with only 1 maintainer"
# "What packages have GPL licenses?"
```

Coral's built-in MCP server handles the rest.
```

---

# PHASE K: SBOM Export (CycloneDX)

> **Time estimate**: ~2 hours  
> **Priority**: SHOULD DO — enterprise credibility

## K1: Backend SBOM Generator

### File: `backend/services/sbom_generator.py` (NEW)

**What it does**: Generate a CycloneDX 1.5 SBOM in JSON format from scan results.

```python
import json
from datetime import datetime, timezone
import uuid

def generate_cyclonedx_sbom(scan: dict) -> dict:
    """Generate CycloneDX 1.5 SBOM from scan results."""
    components = []
    vulnerabilities = []
    
    for pkg in scan.get("packages", []):
        component = {
            "type": "library",
            "name": pkg["name"],
            "version": pkg["version"],
            "purl": f"pkg:npm/{pkg['name']}@{pkg['version']}",
        }
        if pkg.get("license"):
            component["licenses"] = [{"license": {"id": pkg["license"]}}]
        components.append(component)
        
        # Add vulnerabilities
        for vuln in pkg.get("vulnerabilities", []):
            vulnerabilities.append({
                "id": vuln.get("id", ""),
                "source": {"name": "OSV", "url": "https://osv.dev"},
                "ratings": [{"severity": vuln.get("severity", "UNKNOWN").lower()}],
                "affects": [{"ref": component["purl"]}],
                "description": vuln.get("summary", ""),
            })
    
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tools": [{"name": "ShipWatch", "version": "1.0.0"}],
            "component": {
                "type": "application",
                "name": scan.get("repo_name", "unknown"),
            }
        },
        "components": components,
        "vulnerabilities": vulnerabilities,
    }
```

### File: `backend/main.py` (MODIFY)

Add endpoint `GET /api/export/sbom/{scan_id}`:

```python
@app.get("/api/export/sbom/{scan_id}")
async def export_sbom(scan_id: str):
    scan = store.get_scan(scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")
    sbom = generate_cyclonedx_sbom(scan)
    return Response(
        content=json.dumps(sbom, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=sbom-{scan_id}.cdx.json"}
    )
```

### Frontend: Add "SBOM" to the export dropdown

Add a "CycloneDX SBOM" option alongside the existing Markdown and JSON exports.

---

# PHASE L: CI Gate (GitHub Actions)

> **Time estimate**: ~2-3 hours  
> **Priority**: SHOULD DO — makes ShipWatch part of dev workflow

## L1: GitHub Action Template

### File: `shipwatch-action.yml` (NEW, in project root)

```yaml
name: ShipWatch Supply Chain Audit
on:
  pull_request:
    paths: ['package.json', 'package-lock.json']
  push:
    branches: [main]

jobs:
  shipwatch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install ShipWatch CLI
        run: pip install httpx

      - name: Run ShipWatch Scan
        env:
          SHIPWATCH_API: ${{ secrets.SHIPWATCH_API_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REPO_URL="https://github.com/${{ github.repository }}"
          # Start scan
          SCAN_ID=$(curl -s -X POST "$SHIPWATCH_API/api/scan" \
            -H "Content-Type: application/json" \
            -d "{\"repo_url\": \"$REPO_URL\"}" | jq -r '.scan_id')
          
          # Poll until complete
          for i in $(seq 1 60); do
            STATUS=$(curl -s "$SHIPWATCH_API/api/results/$SCAN_ID" | jq -r '.status')
            if [ "$STATUS" = "complete" ]; then break; fi
            if [ "$STATUS" = "error" ]; then echo "Scan failed"; exit 1; fi
            sleep 5
          done
          
          # Check results
          RESULT=$(curl -s "$SHIPWATCH_API/api/results/$SCAN_ID")
          CRITICAL=$(echo "$RESULT" | jq '.critical_count')
          echo "## ShipWatch Scan Results" >> $GITHUB_STEP_SUMMARY
          echo "- Critical: $CRITICAL" >> $GITHUB_STEP_SUMMARY
          echo "- Warning: $(echo $RESULT | jq '.warning_count')" >> $GITHUB_STEP_SUMMARY
          echo "- Healthy: $(echo $RESULT | jq '.healthy_count')" >> $GITHUB_STEP_SUMMARY
          
          if [ "$CRITICAL" -gt 0 ]; then
            echo "::error::ShipWatch found $CRITICAL critical dependencies"
            exit 1
          fi
```

## L2: Add to README

```markdown
## 🔄 CI/CD Integration

Add ShipWatch to your GitHub Actions pipeline:

```yaml
# Copy shipwatch-action.yml to .github/workflows/
# Set SHIPWATCH_API_URL secret to your ShipWatch backend URL
```

ShipWatch will:
- Scan on every PR that changes `package.json`
- Block merge if critical vulnerabilities are found
- Add a summary to the PR checks
```

---

# PHASE M: Pre-loaded Demo Cache

> **Time estimate**: ~1 hour  
> **Priority**: MUST DO — insurance against demo failures

## M1: Pre-scan Popular Repos

Run these scans locally and save results:

```bash
# Start backend, then:
curl -X POST http://localhost:8000/api/scan -H "Content-Type: application/json" -d '{"repo_url":"https://github.com/expressjs/express"}'
curl -X POST http://localhost:8000/api/scan -H "Content-Type: application/json" -d '{"repo_url":"https://github.com/lodash/lodash"}'
curl -X POST http://localhost:8000/api/scan -H "Content-Type: application/json" -d '{"repo_url":"https://github.com/fastify/fastify"}'
```

Wait for all to complete. The results are now cached in `shipwatch.db`.

## M2: Frontend "Try These" Section

On the landing page, show pre-scanned repos with instant results:

```tsx
const demoRepos = [
  { name: "express", scanId: "cached_id_1", critical: 4, total: 44 },
  { name: "lodash", scanId: "cached_id_2", critical: 2, total: 12 },
  { name: "fastify", scanId: "cached_id_3", critical: 0, total: 28 },
];

// "See live results →" links directly to /scan/{cached_id}
```

## M3: Backend Cache Check

In `POST /api/scan`, check if the repo was scanned recently (within last 24h). If so, return the cached scan_id instead of re-scanning. This also speeds up the demo.

---

# PHASE O: Decision Intelligence Engine

> **Time estimate**: ~8-10 hours
> **Priority**: HIGHEST — this is the product differentiator.
> **Rationale**: Every SCA tool answers "what vulnerabilities exist." Nobody answers "which ones will actually
> hurt you and what should you do about them." This phase transforms ShipWatch from a report product into a
> decision product. Hackathon judges will see dozens of "CVE dashboards" — only one will tell developers
> what to actually DO.

## Why This Phase Exists (The Strategic Argument)

The current product scores dependencies across security/maintenance/ecosystem. That's defensible but
insufficient. The scoring methodology is a *measurement* — not a *decision*. A developer staring at
"risk_score: 6.2" still has to answer: "Do I drop everything and fix this, or can it wait?"

Three data sources close the gap:

1. **EPSS** (Exploit Prediction Scoring System by FIRST.org) — answers "What is the probability this CVE
   gets exploited in the next 30 days?" This is a daily-updated ML model that outperforms CVSS for
   prioritization. CVSS tells you how bad a vuln *could* be. EPSS tells you how likely it *will* be. 
   A CVSS 9.8 with EPSS 0.001 is less urgent than a CVSS 6.5 with EPSS 0.87.

2. **CISA KEV** (Known Exploited Vulnerabilities catalog) — answers "Is this CVE already being actively
   exploited in the wild?" Binary signal, authoritative source. If it's in the KEV, it's not theoretical.
   Also contains ransomware campaign flags — rare, extremely high-signal data.

3. **Dependency depth** (direct vs devDependency) — answers "Does this dependency ship in my production
   bundle?" A CVE in a devDependency (linter, test runner, build tool) almost never affects deployed code.
   Currently we merge `dependencies` and `devDependencies` without distinction. Separating them is free
   signal.

Combined, these three inputs turn an opaque risk score into an **actionable decision**:

| Decision | Meaning | When |
|----------|---------|------|
| 🔴 **FIX NOW** | Drop what you're doing | EPSS > 0.4, OR in CISA KEV, OR CVSS ≥ 9.0 with a fix available |
| 🟡 **WATCH** | Schedule this sprint | Moderate EPSS (0.05-0.4), OR deprecated, OR stale with vulns |
| 🟢 **IGNORE** | Safe to deprioritize | Low EPSS (< 0.05), not in KEV, no critical CVEs, OR devDependency-only |

---

## O1: EPSS + KEV Enrichment (Backend)

### O1a: EPSS Client

**File**: `backend/services/epss_client.py` [NEW]

**API**: `https://api.first.org/data/v1/epss?cve=CVE-2021-44228,CVE-2024-29415,...`

The EPSS API supports **batch queries** (comma-separated CVE IDs). This means: collect ALL CVE IDs from
ALL packages in a scan, make ONE HTTP call, get all EPSS scores. Cost: 1 HTTP request per scan.

Response shape (verified live):
```json
{
  "status": "OK",
  "total": 3,
  "data": [
    {"cve": "CVE-2024-29415", "epss": "0.843400000", "percentile": "0.993330000", "date": "2026-05-30"},
    {"cve": "CVE-2022-25883", "epss": "0.005980000", "percentile": "0.697210000", "date": "2026-05-30"}
  ]
}
```

Implementation:
```python
async def fetch_epss_scores(cve_ids: list[str]) -> dict[str, dict]:
    """Batch fetch EPSS scores. Returns {cve_id: {epss: float, percentile: float}}."""
    # Chunk into batches of 100 (API limit unclear, be safe)
    # Single HTTP call per batch
    # Return dict keyed by CVE ID for O(1) lookup during scoring
```

### O1b: KEV Client

**File**: `backend/services/kev_client.py` [NEW]

**API**: `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`

KEV is a single bulk download (~400KB JSON, 1607 entries). Download once, cache for 24 hours.
Build an in-memory set of CVE IDs for O(1) lookup.

Implementation:
```python
_kev_cache: set[str] = set()
_kev_details: dict[str, dict] = {}
_kev_last_fetch: float = 0

async def is_in_kev(cve_id: str) -> bool:
    """Check if CVE is in CISA KEV catalog."""

async def get_kev_details(cve_id: str) -> dict | None:
    """Get KEV entry details (required_action, due_date, ransomware_use)."""
```

### O1c: Pipeline Integration

**File**: `backend/main.py` [MODIFY — `run_scan_pipeline`]

After all packages are enriched and scored (current step 3), add two new enrichment steps:

```
Step 3.5: Collect all CVE IDs across all packages → batch EPSS fetch → attach epss_score + epss_percentile to each vulnerability
Step 3.6: For each CVE, check KEV → attach in_kev: true/false + kev_details to each vulnerability
```

These steps add **2 HTTP requests** total to the scan (1 EPSS batch, 1 KEV download-or-cache-hit).
Negligible latency impact.

### O1d: Enriched Vulnerability Model

Each vulnerability object currently has: `{id, summary, severity, cvss_score, fixed_version, ...}`

After enrichment, add:
```json
{
  "epss_score": 0.843,
  "epss_percentile": 0.993,
  "in_kev": true,
  "kev_ransomware": "Known",
  "kev_required_action": "Apply mitigations per vendor instructions..."
}
```

---

## O2: Dependency Context Tags

### O2a: Direct vs Dev Dependency Tagging

**File**: `backend/services/dep_parser.py` [MODIFY]

Currently the parser merges `dependencies` and `devDependencies` without distinction (line 22-24).

Change: tag each dependency with its source section.

```python
results.append({
    "name": name,
    "version": clean_version or version_spec,
    "dep_type": "production",  # or "dev"
    ...
})
```

**Why this matters**: A CVSS 9.8 vulnerability in `jest` (devDependency, never runs in production)
is almost never exploitable. A CVSS 6.5 vulnerability in `express` (production dependency, handles
every HTTP request) can be catastrophic. This single tag reshapes the entire risk calculation.

---

## O3: Decision Engine (The Core Differentiator)

**File**: `backend/services/decision_engine.py` [NEW]

This module takes a scored package (with EPSS + KEV enrichment) and produces a **decision** with
**evidence**. Not a number. Not a color. A decision.

### Decision Logic

```python
def decide(pkg: dict) -> dict:
    """
    Returns:
      {
        "action": "fix_now" | "watch" | "ignore",
        "reasons": [
          {"signal": "epss_high", "detail": "84.3% chance of exploitation within 30 days"},
          {"signal": "in_kev", "detail": "Actively exploited — CISA directive requires remediation by June 10"},
          {"signal": "dev_only", "detail": "devDependency — not deployed to production"}
        ],
        "confidence": "high" | "medium" | "low",
        "urgency_rank": 1  # integer for sorting (1 = most urgent)
      }
    """
```

### Decision Rules (ordered by priority)

**FIX NOW** — any ONE of these is sufficient:
1. Any vulnerability with `in_kev == true` → "Actively exploited in the wild (CISA KEV)"
2. Any vulnerability with `epss_score >= 0.4` → "X% probability of exploitation within 30 days"
3. Any vulnerability with `cvss_score >= 9.0` AND a `fixed_version` exists → "Critical severity, patch available"
4. Any vulnerability with `kev_ransomware == "Known"` → "Used in ransomware campaigns"

**Downgrade to WATCH if**: `dep_type == "dev"` and no KEV entry. A devDependency with high EPSS is still
concerning (supply chain vector) but the urgency is lower because the vulnerable code isn't deployed.

**WATCH** — any ONE of these:
1. EPSS between 0.05 and 0.4 → "Moderate exploitation probability"
2. CVSS 7.0-8.9 with no public exploit → "High severity but no known active exploitation"
3. Package is deprecated → "Deprecated — no future patches expected"
4. `_maintenance_risk >= 7.0` AND `vuln_count > 0` → "Unmaintained with known vulnerabilities"

**IGNORE** — ALL of these must be true:
1. No vulnerability has EPSS > 0.05
2. No vulnerability is in KEV
3. No CVSS score above 7.0
4. Package is not deprecated
5. `risk_score < 4.0`

**Special case: devDependency with zero vulns** → IGNORE regardless of maintenance/ecosystem risk.
A dev-only tool with low stars doesn't affect production security.

### Why NOT use reachability here

Full reachability analysis (tree-sitter → call graph → entry-point-to-sink traversal) is the
correct long-term approach. But for the hackathon it requires:
- Cloning the entire repository (current tool fetches only package.json)
- Parsing all JS/TS files into ASTs
- Building an inter-file call graph
- Mapping CVE-affected functions to specific package exports
- Graph traversal from HTTP handlers to vulnerable sinks

That's 2-3 weeks of work. The EPSS+KEV+dep_type approach achieves **80% of the value in 5% of the
time** because:
- EPSS empirically predicts real-world exploitation better than reachability heuristics
- KEV provides ground truth (not prediction — evidence of actual exploitation)
- dep_type separates production exposure from build tooling

Post-hackathon roadmap: add true reachability as a premium feature. The decision engine is designed
to accept additional signals without restructuring. Add a `reachable: true/false` flag later and
the FIX NOW rules simply get sharper.

---

## O4: Frontend Decision Cards

**File**: `frontend/src/app/scan/[id]/page.tsx` [MODIFY]

### O4a: Decision Badge (replaces or augments risk badge)

Current: `CRITICAL | WARNING | HEALTHY` (measurement)
New: `FIX NOW | WATCH | IGNORE` (decision) alongside the existing risk badge

The risk badge stays for detail — it answers "how risky is this?" The decision badge answers
"what should I do?" Both are visible but the decision badge is primary.

### O4b: Evidence Panel

When a package is expanded, show the evidence that drove the decision:

```
┌──────────────────────────────────────────────────────────┐
│ 🔴 FIX NOW — debug v4.4.0                               │
│                                                          │
│ Evidence:                                                │
│ ⚡ EPSS 84.3% — likely to be exploited within 30 days   │
│ 🎯 CISA KEV — actively exploited in the wild            │
│ 🏭 Production dependency — ships in your deployed code  │
│ 🔧 Fix available — upgrade to v4.4.1                    │
│                                                          │
│ [Copy upgrade command]  [Create GitHub Issue]            │
└──────────────────────────────────────────────────────────┘
```

vs

```
┌──────────────────────────────────────────────────────────┐
│ 🟢 IGNORE — eslint v9.0.0                               │
│                                                          │
│ Evidence:                                                │
│ 🧪 Dev dependency — not deployed to production          │
│ 📊 EPSS 0.3% — very unlikely to be exploited           │
│ ✅ Not in CISA KEV                                      │
│                                                          │
│ This dependency only runs during development/build.      │
│ No action needed.                                        │
└──────────────────────────────────────────────────────────┘
```

### O4c: Decision Summary Bar

At the top of scan results, replace (or augment) the stat cards with:

```
┌─────────────────────────────────────────────────────────┐
│  🔴 3 Fix Now   │  🟡 7 Watch   │  🟢 34 Ignore       │
│  action needed   │  this sprint  │  safe                │
└─────────────────────────────────────────────────────────┘
```

This gives a developer instant triage: "I have 3 things to fix today."

### O4d: Sort and Filter by Decision

Add "action" as a sort/filter option alongside the existing risk/name/vulns/downloads/stars.
Default sort: FIX NOW first → WATCH → IGNORE (instead of critical → warning → healthy).

---

## O5: Coral Source Specs for Bounty

### O5a: EPSS Source Spec

**File**: `backend/coral_specs/epss.yaml` [NEW]

```yaml
name: epss
version: 0.1.0
dsl_version: 3
backend: http
description: >-
  FIRST.org Exploit Prediction Scoring System — daily ML predictions of CVE
  exploitation probability within the next 30 days.
base_url: https://api.first.org
tables:
  - name: scores
    description: EPSS score and percentile for a given CVE identifier.
    filters:
      - name: cve
        required: true
        description: CVE identifier (e.g. "CVE-2021-44228"). Comma-separated for batch queries.
    request:
      method: GET
      path: /data/v1/epss
      query_params:
        - name: cve
          from: filter
          key: cve
    response:
      rows_path: [data]
      row_strategy: direct
    columns:
      - name: cve
        type: Utf8
        ...
      - name: epss
        type: Float64
        description: Exploitation probability (0.0 to 1.0) within next 30 days.
        ...
      - name: percentile
        type: Float64
        description: Percentile rank among all scored CVEs.
        ...
      - name: date
        type: Utf8
        description: Date of the EPSS model run (ISO format).
        ...
```

This lets anyone with Coral run:
```sql
SELECT cve, epss, percentile FROM epss.scores WHERE cve = 'CVE-2021-44228'
```

### O5b: KEV Source Spec

**File**: `backend/coral_specs/kev.yaml` [NEW]

```yaml
name: kev
version: 0.1.0
dsl_version: 3
backend: http
description: >-
  CISA Known Exploited Vulnerabilities catalog — authoritative list of
  CVEs actively exploited in the wild.
base_url: https://www.cisa.gov
tables:
  - name: vulnerabilities
    description: All CVEs in the KEV catalog with required remediation actions and dates.
    filters: []
    request:
      method: GET
      path: /sites/default/files/feeds/known_exploited_vulnerabilities.json
    response:
      rows_path: [vulnerabilities]
      row_strategy: direct
    columns:
      - name: cve_id
        type: Utf8
        ...
      - name: vendor
        type: Utf8
        ...
      - name: product
        type: Utf8
        ...
      - name: vulnerability_name
        type: Utf8
        ...
      - name: date_added
        type: Utf8
        ...
      - name: short_description
        type: Utf8
        ...
      - name: required_action
        type: Utf8
        ...
      - name: due_date
        type: Utf8
        ...
      - name: ransomware_use
        type: Utf8
        description: "Known", "Unknown"
        ...
```

This lets anyone with Coral run:
```sql
SELECT cve_id, vulnerability_name, ransomware_use
FROM kev.vulnerabilities
WHERE cve_id = 'CVE-2021-44228'
```

Or more powerfully, join across sources:
```sql
SELECT k.cve_id, k.vulnerability_name, e.epss, e.percentile
FROM kev.vulnerabilities k
JOIN epss.scores e ON k.cve_id = e.cve
WHERE e.epss > 0.5
ORDER BY e.epss DESC
```

### Why these specs are bounty-worthy

The hackathon gives $100 per original Coral source spec (up to 2). These specs:
- Are genuinely useful beyond ShipWatch (any security tool can use them)
- Demonstrate Coral's cross-source JOIN capability (join KEV with EPSS)
- Are small, clean, and immediately testable
- Don't exist in Coral's built-in sources

---

## O6: Updated SCORING.md and Reports

### O6a: Update SCORING.md

Add a new "Decision Layer" section explaining the EPSS+KEV+dep_type methodology.
Document why EPSS > CVSS for prioritization (cite FIRST.org's own research).
Show the decision thresholds and their rationale.

### O6b: Update Markdown/JSON Export

The exported report should be decision-shaped:

```markdown
## 🔴 Fix Now (3 packages)

### debug v4.4.0
- **Decision**: Fix Now
- **EPSS**: 84.3% (99th percentile) — very likely to be exploited
- **CISA KEV**: Yes — actively exploited, ransomware campaigns
- **Type**: Production dependency
- **Fix**: `npm install debug@4.4.1`

## 🟡 Watch (7 packages)
...

## 🟢 Ignore (34 packages)
(collapsed by default)
```

---

## O7: Execution Order

Strict dependency order — each step unlocks the next:

```
O1a: EPSS client (1.5h)
O1b: KEV client (1h)
  ↓
O1c+O1d: Pipeline integration + enriched model (1.5h)
O2a: dep_type tagging (0.5h)
  ↓
O3: Decision engine (2h) ← core differentiator
O5: Coral source specs (1.5h) ← bounty money
  ↓
O4: Frontend decision cards (2-3h) ← visible impact
O6: Updated docs + exports (1h)
```

Total: ~11-12h. Can be trimmed to ~8h by doing O4 minimally (badge + summary bar only,
skip the full evidence panel for v1).

---

# PHASE N: Polish & Submission

> **Time estimate**: ~2-3 hours

## N1: Update README.md with screenshots

Take screenshots of:
1. Landing page
2. Live scanning feed
3. Dashboard with results
4. Remediation checklist
5. Package detail with fix commands
6. SBOM export

## N2: Demo Video (2-3 minutes)

**Script**:
1. (0:00-0:15) Hook: "Your dependencies are your weakest link"
2. (0:15-0:30) Paste express repo URL, click Scan
3. (0:30-1:00) Watch live streaming results appear one by one
4. (1:00-1:30) Dashboard overview: risk bar, stat cards, policy violations
5. (1:30-1:50) Click a critical package → see fix command → click "Create Issue"
6. (1:50-2:10) Show remediation checklist → check off a fix → progress bar fills
7. (2:10-2:25) Export SBOM → show CycloneDX JSON
8. (2:25-2:40) Show Coral SQL query that powered it all
9. (2:40-2:55) Show MCP integration from IDE
10. (2:55-3:00) Close: "ShipWatch. Because your dependencies shouldn't be a black box."

## N3: Submission Checklist

- [ ] GitHub repo public
- [ ] README with screenshots
- [ ] Demo video uploaded (YouTube unlisted or Loom)
- [ ] Submit hackathon form
- [ ] Post osv.yaml + npm.yaml in Coral Discord ($100×2 bounty)
- [ ] Submit BLOG.md for Captain's Log bounty (Keychron keyboard)
- [ ] Fill AI Tools Survey
- [ ] Star github.com/withcoral/coral

---

# Execution Order (Recommended)

For maximum impact given time constraints:

```
Day 1 (Today):
├── Phase H: Risk scoring overhaul (1.5h) ← fixes defensibility
├── Phase F: SSE streaming scan (3h) ← biggest UX win
├── Phase G: Upgrade path generator (1.5h) ← actionable fixes
└── Phase M: Pre-loaded demo cache (1h) ← demo insurance

Day 2:
├── Phase D: Auth + user system (3-4h) ← blocks dashboard
├── Phase E: Landing page + blog (4-5h) ← first impression
├── Phase I: Remediation features (4-5h) ← action features
└── Phase K: SBOM export (2h)

Day 3 (Final):
├── Phase J: MCP server (3h) ← Coral-native wow
├── Phase L: CI gate (2-3h) ← workflow integration
├── Phase N: Polish + submission (2-3h)
└── Buffer time for bugs
```

Total: ~30-35 hours across 3 days. Aggressive but doable.
