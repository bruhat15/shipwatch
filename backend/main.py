"""
ShipWatch Backend — FastAPI Application
Open Source Supply Chain Intelligence Agent
"""

import os
import json
import uuid
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from dotenv import load_dotenv
import httpx

from fastapi.responses import StreamingResponse

from fastapi.responses import Response
from auth import auth_router, get_current_user, get_optional_user
from services.dep_parser import parse_dependencies_from_url
from services.coral_client import CoralClient
from services.risk_scorer import score_dependencies
from services.epss_client import fetch_epss_scores, enrich_vulnerabilities_with_epss, collect_cve_ids
from services.kev_client import enrich_vulnerabilities_with_kev
from services.decision_engine import decide_all
from services.llm_summarizer import generate_summary
from services.fix_generator import generate_fixes
from services.scan_store import ScanStore
from services.contact_email import send_contact_email, ContactEmailError
from services.sbom_generator import generate_cyclonedx_sbom
from services.policy_engine import evaluate_scan_policies, DEFAULT_POLICIES

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv()

# --- Data models ---

class ScanRequest(BaseModel):
    repo_url: str = Field(..., description="GitHub repository URL to scan")
    force: bool = Field(False, description="Bypass cache and force a fresh scan")

class ContactRequest(BaseModel):
    name: str
    email: str
    message: str

class ScanResponse(BaseModel):
    scan_id: str
    status: str
    message: str

class PackageRisk(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: str
    version: str
    risk_level: str  # "critical", "warning", "healthy"
    risk_score: float  # 0-10 scale (CVSS-grounded)
    confidence: str = "medium"  # "low", "medium", "high"
    github_repo: str | None = None
    # GitHub health
    stars: int | None = None
    open_issues: int | None = None
    last_commit: str | None = None
    contributors_count: int | None = None
    scorecard_score: float | None = None  # OpenSSF Scorecard 0-10
    # Security
    vulnerabilities: list[dict] = []
    vuln_count: int = 0
    highest_severity: str | None = None
    epss_max_score: float | None = None
    in_kev: bool | None = None
    kev_ransomware: bool | None = None
    # npm ecosystem
    weekly_downloads: int | None = None
    maintainers_count: int | None = None
    license: str | None = None
    deprecated: bool = False
    dep_type: str | None = None
    # AI summary
    ai_summary: str | None = None
    ai_recommendation: str | None = None
    # License analysis
    license_issues: list[dict] = []
    # Actionable fixes
    fixes: list[dict] = []
    # Decision intelligence
    decision: dict | None = None
    # Risk dimension sub-scores (0-10) — exposed for Coral MCP queries.
    # Field aliases map the _-prefixed keys from risk_scorer.py to public JSON keys.
    security_risk: float | None = Field(None, alias="_security_risk")
    maintenance_risk: float | None = Field(None, alias="_maintenance_risk")
    ecosystem_risk: float | None = Field(None, alias="_ecosystem_risk")

class ScanResult(BaseModel):
    scan_id: str
    repo_url: str
    repo_name: str
    status: str  # "pending", "scanning", "complete", "error"
    scanned_at: str | None = None
    total_deps: int = 0
    critical_count: int = 0
    warning_count: int = 0
    healthy_count: int = 0
    overall_score: float = 0.0
    # Decision intelligence counts
    fix_now_count: int = 0
    watch_count: int = 0
    ignore_count: int = 0
    packages: list[PackageRisk] = []
    coral_query: str | None = None
    error_message: str | None = None
    policy_violations: list[dict] = []

    model_config = ConfigDict(extra="ignore")


# --- App setup ---

store = ScanStore()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.init()
    app.state.store = store
    yield
    await store.close()

app = FastAPI(
    title="ShipWatch API",
    description="Open Source Supply Chain Intelligence — powered by Coral",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth")


# In-memory store for streaming progress (scan_id -> list of enriched packages)
_scan_progress: dict[str, list[dict]] = {}


async def run_scan_pipeline(scan_id: str, repo_url: str):
    """The main scan pipeline — runs in background with live progress."""
    coral = CoralClient()
    _scan_progress[scan_id] = []

    try:
        # Step 1: Parse dependencies
        await store.update_status(scan_id, "parsing")
        deps = await parse_dependencies_from_url(repo_url)

        if not deps:
            await store.update_status(scan_id, "error",
                error_message="No dependencies found in this repository.")
            return

        await store.update_deps_count(scan_id, len(deps))

        # Step 2: Query Coral for health + security + ecosystem data
        await store.update_status(scan_id, "querying")

        semaphore = asyncio.Semaphore(10)

        async def enrich_single(dep: dict) -> dict:
            async with semaphore:
                enriched = {
                    "name": dep["name"],
                    "version": dep["version"],
                    "github_repo": dep.get("github_repo"),
                    "dep_type": dep.get("dep_type"),
                }

                # A) Query npm FIRST
                try:
                    npm_data = await coral.query_npm_metadata(dep["name"])
                    enriched.update(npm_data)
                except Exception:
                    pass

                # B) Query GitHub
                github_repo = enriched.get("github_repo")
                if github_repo:
                    try:
                        gh_data = await coral.query_github_health(github_repo)
                        enriched.update(gh_data)
                    except Exception:
                        pass

                    # C) Query OpenSSF Scorecard (free, no auth)
                    try:
                        scorecard = await coral.query_scorecard(github_repo)
                        if scorecard is not None:
                            enriched["scorecard_score"] = scorecard
                    except Exception:
                        pass

                # D) Query OSV for vulnerabilities
                try:
                    vuln_data = await coral.query_vulnerabilities(
                        dep["name"], dep.get("ecosystem", "npm")
                    )
                    enriched.update(vuln_data)
                except Exception:
                    pass

                return enriched

        # Run enrichments concurrently but process each result as it completes
        tasks = [asyncio.create_task(enrich_single(d)) for d in deps]

        # Step 3: Score risks (streaming) — as each enrichment finishes, score and push
        await store.update_status(scan_id, "scoring")
        scored_items: list[dict] = []
        for fut in asyncio.as_completed(tasks):
            try:
                enriched = await fut
            except Exception:
                # Skip failed enrichment
                continue

            # Basic derived fields
            enriched.setdefault("vulnerabilities", [])
            enriched["vuln_count"] = len(enriched.get("vulnerabilities", []))
            enriched["highest_severity"] = None
            if enriched.get("vulnerabilities"):
                severities = [v.get("severity") for v in enriched.get("vulnerabilities", []) if v.get("severity")]
                enriched["highest_severity"] = max(severities) if severities else None

            # Score just this package to get immediate feedback
            single_scored = score_dependencies([enriched])[0]
            single_scored["fixes"] = generate_fixes(single_scored)

            scored_items.append(single_scored)

            # Append to in-memory progress so SSE can stream incremental packages
            _scan_progress[scan_id].append(single_scored)
            # Persist partial package result so GET /api/results can return live data
            try:
                await store.append_package_result(scan_id, single_scored, status="scoring", total_deps=len(deps))
            except Exception:
                pass

        # Once all items processed, produce the final sorted list
        scored = score_dependencies(scored_items)

        # EPSS + KEV enrichment for decision intelligence
        cve_ids = collect_cve_ids(scored)
        epss_scores = await fetch_epss_scores(cve_ids) if cve_ids else {}
        enrich_vulnerabilities_with_epss(scored, epss_scores)
        await enrich_vulnerabilities_with_kev(scored)

        # Decision engine layer (fix_now/watch/ignore)
        scored = decide_all(scored)

        # Generate fixes for final sorted list (ensure order)
        for pkg in scored:
            pkg["fixes"] = generate_fixes(pkg)

        # Store final progress for SSE
        _scan_progress[scan_id] = scored

        # Step 4: Generate AI summaries for risky packages
        await store.update_status(scan_id, "summarizing")
        risky_packages = [p for p in scored if p["risk_level"] != "healthy"]

        for pkg in risky_packages[:10]:
            try:
                summary = await generate_summary(pkg)
                pkg["ai_summary"] = summary.get("summary", "")
                pkg["ai_recommendation"] = summary.get("recommendation", "")
            except Exception:
                pass

        # Step 5: Build the coral query string for display
        coral_query = coral.build_display_query(deps)

        # Step 6: Evaluate policies
        policy_violations = evaluate_scan_policies(scored, DEFAULT_POLICIES)

        # Step 7: Save results
        packages = [PackageRisk(**p) for p in scored]
        critical = sum(1 for p in packages if p.risk_level == "critical")
        warning = sum(1 for p in packages if p.risk_level == "warning")
        healthy = sum(1 for p in packages if p.risk_level == "healthy")
        overall_score = round(
            sum(p.risk_score for p in packages) / len(packages),
            1,
        ) if packages else 0.0

        repo_name = repo_url.rstrip("/").split("/")[-1]

        result = ScanResult(
            scan_id=scan_id,
            repo_url=repo_url,
            repo_name=repo_name,
            status="complete",
            scanned_at=datetime.utcnow().isoformat(),
            total_deps=len(packages),
            critical_count=critical,
            warning_count=warning,
            healthy_count=healthy,
            overall_score=overall_score,
            fix_now_count=sum(1 for p in scored if p.get("decision", {}).get("action") == "fix_now"),
            watch_count=sum(1 for p in scored if p.get("decision", {}).get("action") == "watch"),
            ignore_count=sum(1 for p in scored if p.get("decision", {}).get("action") == "ignore"),
            packages=packages,
            coral_query=coral_query,
            policy_violations=policy_violations,
        )
        await store.save_result(scan_id, result)

        # Store final for SSE
        _scan_progress[scan_id] = scored

    except Exception as e:
        await store.update_status(scan_id, "error",
            error_message=f"Scan failed: {str(e)}")
    finally:
        # Clean up progress after a delay
        await asyncio.sleep(30)
        _scan_progress.pop(scan_id, None)


# --- API Routes ---

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "shipwatch", "version": "1.0.0"}


@app.post("/api/contact")
async def submit_contact(request: ContactRequest):
    """Handle contact form submission."""
    try:
        await asyncio.to_thread(send_contact_email, request.name, request.email, request.message)
    except ContactEmailError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "ok"}


@app.post("/api/scan", response_model=ScanResponse)
async def start_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_optional_user),
):
    """Start a new dependency scan for a GitHub repository."""
    # Validate URL
    if "github.com" not in request.repo_url:
        raise HTTPException(400, "Please provide a valid GitHub repository URL")
    user_id = current_user["id"] if current_user else None

    # Check for cached recent scan
    if not request.force:
        cached = await store.get_recent_complete_scan(request.repo_url, max_age_hours=24)
        if cached:
            cached_user_id = await store.get_scan_user(cached)
            
            # If the user is logged in, and the cached scan doesn't belong to them, clone it
            if user_id and cached_user_id != user_id:
                new_scan_id = str(uuid.uuid4())[:8]
                success = await store.clone_scan(cached, new_scan_id, user_id)
                if success:
                    cached = new_scan_id
                    
            return ScanResponse(
                scan_id=cached,
                status="complete",
                message="Using cached recent scan (within 24h).",
            )

    scan_id = str(uuid.uuid4())[:8]
    await store.create_scan(scan_id, request.repo_url, user_id=user_id)

    # Run scan in background
    background_tasks.add_task(run_scan_pipeline, scan_id, request.repo_url)

    return ScanResponse(
        scan_id=scan_id,
        status="pending",
        message="Scan started. Poll /api/results/{scan_id} for progress.",
    )


@app.get("/api/results/{scan_id}")
async def get_results(scan_id: str):
    """Get scan results by ID."""
    result = await store.get_result(scan_id)
    if not result:
        raise HTTPException(404, f"Scan {scan_id} not found")
    return result


@app.get("/api/scan/{scan_id}/stream")
async def stream_scan(scan_id: str):
    """SSE endpoint — streams scan progress in real-time."""
    async def event_generator():
        last_count = 0
        while True:
            # Check scan status
            result = await store.get_result(scan_id)
            if not result:
                yield f"event: error\ndata: {json.dumps({'message': 'Scan not found'})}\n\n"
                break

            status = result.get("status", "pending")
            total_deps = result.get("total_deps", 0)

            # Send status update
            yield f"event: status\ndata: {json.dumps({'status': status, 'total_deps': total_deps})}\n\n"

            # Check if complete
            if status == "complete":
                yield f"event: done\ndata: {json.dumps({'scan_id': scan_id})}\n\n"
                break
            elif status == "error":
                yield f"event: error\ndata: {json.dumps({'message': result.get('error_message', 'Unknown error')})}\n\n"
                break

            # Stream individual packages from in-memory progress
            progress = _scan_progress.get(scan_id, [])
            if len(progress) > last_count:
                for pkg in progress[last_count:]:
                    safe_pkg = {
                        "name": pkg.get("name"),
                        "version": pkg.get("version"),
                        "risk_level": pkg.get("risk_level", "healthy"),
                        "risk_score": pkg.get("risk_score", 0),
                        "vuln_count": pkg.get("vuln_count", 0),
                        "highest_severity": pkg.get("highest_severity"),
                    }
                    yield f"event: package\ndata: {json.dumps(safe_pkg)}\n\n"
                last_count = len(progress)

            await asyncio.sleep(0.8)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/user/scans")
@app.get("/api/scans")
async def list_user_scans(current_user=Depends(get_current_user)):
    """List scans for the authenticated user."""
    return await store.list_scans_by_user(current_user["id"])


@app.delete("/api/user/scans")
async def delete_user_scans(repo_url: str, current_user=Depends(get_current_user)):
    """Delete all scan history entries for one repository."""
    deleted = await store.delete_scans_by_repo(current_user["id"], repo_url)
    return {"deleted": deleted}


@app.get("/api/github/repos")
async def list_github_repos(current_user=Depends(get_current_user)):
    """List GitHub repositories for the authenticated user."""
    token = await store.get_user_oauth_token(current_user["id"], "github")
    if not token:
        raise HTTPException(status_code=401, detail="GitHub account not connected. Authorize GitHub to browse repositories.")

    repos = []
    page = 1
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {token}",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            resp = await client.get(
                "https://api.github.com/user/repos",
                headers=headers,
                params={"per_page": 100, "page": page, "sort": "updated"},
            )
            if resp.status_code == 401 or resp.status_code == 403:
                # Token may have been revoked or scopes removed
                raise HTTPException(status_code=401, detail="GitHub token revoked or unauthorized")
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="GitHub API request failed")

            data = resp.json()
            if not data:
                break

            repos.extend(data)
            if len(data) < 100:
                break
            page += 1

    return [
        {
            "id": repo.get("id"),
            "full_name": repo.get("full_name"),
            "html_url": repo.get("html_url"),
            "private": repo.get("private", False),
            "default_branch": repo.get("default_branch"),
            "updated_at": repo.get("updated_at"),
        }
        for repo in repos
    ]


# --- Phase I: GitHub Issue Creation ---

class IssueRequest(BaseModel):
    repo_url: str
    package_name: str
    scan_id: str
    vuln_id: str | None = None


@app.post("/api/github/issue")
async def create_github_issue(
    req: IssueRequest,
    current_user=Depends(get_current_user),
):
    """Create a GitHub issue on the target repo for a critical vulnerability."""
    # Get the user's stored GitHub token
    token = await store.get_user_oauth_token(current_user["id"], "github")
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub account not connected. Sign in with GitHub to create issues.",
        )

    # Parse owner/repo from the URL (strip .git, trailing slash)
    clean_url = req.repo_url.rstrip("/").removesuffix(".git")
    parts = clean_url.split("github.com/", 1)
    if len(parts) < 2 or "/" not in parts[1]:
        raise HTTPException(400, "Invalid GitHub repository URL")
    owner_repo = parts[1]  # e.g. "expressjs/express"

    # Pull vuln details from stored scan if available
    scan_data = await store.get_result(req.scan_id)
    pkg_info = None
    vuln_info = None
    if scan_data:
        for pkg in scan_data.get("packages", []):
            if pkg.get("name") == req.package_name:
                pkg_info = pkg
                if req.vuln_id:
                    for v in pkg.get("vulnerabilities", []):
                        if v.get("id") == req.vuln_id:
                            vuln_info = v
                            break
                elif pkg.get("vulnerabilities"):
                    vuln_info = pkg["vulnerabilities"][0]
                break

    score = pkg_info.get("risk_score", "N/A") if pkg_info else "N/A"
    confidence = pkg_info.get("confidence", "unknown") if pkg_info else "unknown"
    vuln_id = vuln_info.get("id", "N/A") if vuln_info else (req.vuln_id or "N/A")
    severity = vuln_info.get("severity", "UNKNOWN") if vuln_info else "UNKNOWN"
    summary = vuln_info.get("summary", "See OSV database for details.") if vuln_info else "See OSV database for details."
    fixed = vuln_info.get("fixed_version") if vuln_info else None
    cvss = vuln_info.get("cvss_score") if vuln_info else None

    fix_cmd = f"npm install {req.package_name}@{fixed}" if fixed else f"npm audit fix"
    cvss_str = f" (CVSS {cvss}" + ")" if cvss else ""
    scan_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/scan/{req.scan_id}"

    body = f"""## 🔴 Critical Dependency Vulnerability: `{req.package_name}`

> **Detected by [ShipWatch]({scan_url})** on {datetime.utcnow().strftime('%Y-%m-%d')}

### Vulnerability Details
| Field | Value |
|-------|-------|
| **CVE / Advisory** | `{vuln_id}` |
| **Severity** | {severity}{cvss_str} |
| **Summary** | {summary} |

### Risk Assessment
| Metric | Value |
|--------|-------|
| **ShipWatch Score** | {score}/10 |
| **Confidence** | {confidence} |

### Recommended Fix
```bash
{fix_cmd}
```

{'> **Note**: ' + ('Upgrade to **v' + fixed + '** patches this vulnerability.') if fixed else '> **Note**: No fixed version is currently available. Monitor OSV for updates.'}

---
*Generated by [ShipWatch](https://github.com/shipwatch) — Open Source Supply Chain Intelligence*  
*[View full scan report]({scan_url})*
"""

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {token}",
    }
    payload = {
        "title": f"🔴 [ShipWatch] Critical vulnerability in {req.package_name}: {vuln_id}",
        "body": body,
        "labels": ["security", "dependencies"],
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner_repo}/issues",
            headers=headers,
            json=payload,
        )

    if resp.status_code == 201:
        data = resp.json()
        return {"issue_url": data["html_url"], "issue_number": data["number"]}
    elif resp.status_code == 404:
        raise HTTPException(404, "Repository not found or you don't have access to it.")
    elif resp.status_code in (401, 403):
        raise HTTPException(403, "GitHub token doesn't have permission to create issues. Make sure 'repo' scope is granted.")
    else:
        detail = resp.json().get("message", "Unknown GitHub API error")
        raise HTTPException(502, f"GitHub API error: {detail}")


# --- Phase I3: SVG Badge Generator ---

def _generate_badge_svg(label: str, value: str, color: str) -> str:
    """Generate a shields.io-style SVG badge."""
    lw = max(len(label) * 7 + 10, 70)
    vw = max(len(value) * 7 + 10, 60)
    tw = lw + vw
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{tw}" height="20" role="img" aria-label="{label}: {value}">
  <title>{label}: {value}</title>
  <linearGradient id="sw-grad" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="sw-clip"><rect width="{tw}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#sw-clip)">
    <rect width="{lw}" height="20" fill="#555"/>
    <rect x="{lw}" width="{vw}" height="20" fill="{color}"/>
    <rect width="{tw}" height="20" fill="url(#sw-grad)"/>
  </g>
  <g fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-rendering="geometricPrecision">
    <text x="{lw//2}" y="15" fill="#010101" fill-opacity=".3" text-anchor="middle">{label}</text>
    <text x="{lw//2}" y="14" text-anchor="middle">{label}</text>
    <text x="{lw + vw//2}" y="15" fill="#010101" fill-opacity=".3" text-anchor="middle">{value}</text>
    <text x="{lw + vw//2}" y="14" text-anchor="middle">{value}</text>
  </g>
</svg>'''


@app.get("/api/badge/{scan_id}")
async def get_badge(scan_id: str):
    """Return an SVG badge reflecting the scan's overall risk level."""
    scan = await store.get_result(scan_id)
    if not scan:
        svg = _generate_badge_svg("ShipWatch", "unknown", "#9ca3af")
        return Response(content=svg, media_type="image/svg+xml",
                        headers={"Cache-Control": "no-cache, no-store"})

    score = scan.get("overall_score") or 0.0
    critical = int(scan.get("critical_count") or 0)
    if critical > 0 or float(score) > 6.0:
        color = "#ef4444"
        label_val = f"{score}/10 critical"
    elif float(score) > 3.0:
        color = "#f59e0b"
        label_val = f"{score}/10 warning"
    else:
        color = "#22c55e"
        label_val = f"{score}/10 healthy"

    svg = _generate_badge_svg("ShipWatch", label_val, color)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache, no-store", "Pragma": "no-cache"},
    )


# --- Phase K: SBOM Export ---

@app.get("/api/export/sbom/{scan_id}")
async def export_sbom(scan_id: str):
    """Export CycloneDX 1.5 SBOM for a completed scan."""
    scan = await store.get_result(scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")
    if scan.get("status") != "complete":
        raise HTTPException(400, "Scan is not yet complete")

    sbom = generate_cyclonedx_sbom(scan)
    return Response(
        content=json.dumps(sbom, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="sbom-{scan_id}.cdx.json"',
            "Cache-Control": "no-cache",
        },
    )


# --- Phase I4: Policy Engine API ---

@app.get("/api/user/policies")
async def get_user_policies(current_user=Depends(get_current_user)):
    """Return the default policy set (per-user customisation is future work)."""
    return {"policies": DEFAULT_POLICIES}


@app.get("/api/policy-violations/{scan_id}")
async def get_policy_violations(scan_id: str):
    """Return policy violations for a completed scan."""
    scan = await store.get_result(scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found")
    violations = scan.get("policy_violations", [])
    # Re-evaluate on the fly if not stored (legacy scans)
    if not violations and scan.get("status") == "complete":
        violations = evaluate_scan_policies(scan.get("packages", []), DEFAULT_POLICIES)
    return {"violations": violations, "count": len(violations)}


# --- Phase J: MCP / Coral JSONL Export ---

@app.get("/api/export/jsonl/{scan_id}")
async def export_jsonl(scan_id: str):
    """
    Export scan packages as JSONL (newline-delimited JSON).

    This endpoint powers the Coral MCP integration — the shipwatch.yaml source spec
    reads from /api/results/{scan_id} with rows_path=[packages], but you can also
    download this flat JSONL for direct use with `coral sql`.

    Each line is a single package JSON object with all risk fields.
    """
    scan = await store.get_result(scan_id)
    if not scan:
        raise HTTPException(404, f"Scan {scan_id} not found")
    if scan.get("status") != "complete":
        raise HTTPException(400, f"Scan {scan_id} is not complete yet (status={scan.get('status')})")

    packages = scan.get("packages", [])
    repo_url = scan.get("repo_url", "")
    repo_name = scan.get("repo_name", "")
    scan_scanned_at = scan.get("scanned_at", "")

    lines = []
    for pkg in packages:
        # Flatten to scalar fields suitable for Coral SQL
        row = {
            "scan_id": scan_id,
            "repo_url": repo_url,
            "repo_name": repo_name,
            "scanned_at": scan_scanned_at,
            "name": pkg.get("name"),
            "version": pkg.get("version"),
            "risk_level": pkg.get("risk_level"),
            "risk_score": pkg.get("risk_score"),
            "confidence": pkg.get("confidence"),
            "vuln_count": pkg.get("vuln_count", 0),
            "highest_severity": pkg.get("highest_severity"),
            "license": pkg.get("license"),
            "weekly_downloads": pkg.get("weekly_downloads"),
            "stars": pkg.get("stars"),
            "last_commit": pkg.get("last_commit"),
            "contributors_count": pkg.get("contributors_count"),
            "scorecard_score": pkg.get("scorecard_score"),
            "deprecated": pkg.get("deprecated", False),
            "maintainers_count": pkg.get("maintainers_count"),
            "github_repo": pkg.get("github_repo"),
            "dep_type": pkg.get("dep_type"),
            "epss_max_score": pkg.get("epss_max_score"),
            "in_kev": pkg.get("in_kev"),
            "kev_ransomware": pkg.get("kev_ransomware"),
            "decision_action": (pkg.get("decision") or {}).get("action"),
            "decision_confidence": (pkg.get("decision") or {}).get("confidence"),
            "decision_urgency_rank": (pkg.get("decision") or {}).get("urgency_rank"),
            # Dimension sub-scores — use explicit None check (0.0 is falsy, avoid skipping it)
            "security_risk": pkg["security_risk"] if pkg.get("security_risk") is not None else pkg.get("_security_risk"),
            "maintenance_risk": pkg["maintenance_risk"] if pkg.get("maintenance_risk") is not None else pkg.get("_maintenance_risk"),
            "ecosystem_risk": pkg["ecosystem_risk"] if pkg.get("ecosystem_risk") is not None else pkg.get("_ecosystem_risk"),
        }
        lines.append(json.dumps(row))

    content = "\n".join(lines) + "\n"
    return Response(
        content=content,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="shipwatch-{scan_id}.jsonl"',
            "Cache-Control": "no-cache",
        },
    )




# --- Demo seeding and listing (admin + public) ---
DEMO_REPOS = [
    "https://github.com/expressjs/express",
    "https://github.com/vercel/next.js",
    "https://github.com/fastify/fastify",
]


@app.post("/api/admin/seed_demos")
async def seed_demos(background_tasks: BackgroundTasks):
    """Admin endpoint: ensure demo repos have a recent cached scan. Starts scans in background when missing."""
    created = []
    skipped = []
    for repo in DEMO_REPOS:
        cached = await store.get_recent_complete_scan(repo, max_age_hours=24)
        if cached:
            skipped.append({"repo": repo, "scan_id": cached})
            continue

        scan_id = str(uuid.uuid4())[:8]
        await store.create_scan(scan_id, repo, user_id=None)
        background_tasks.add_task(run_scan_pipeline, scan_id, repo)
        created.append({"repo": repo, "scan_id": scan_id})

    return {"created": created, "skipped": skipped}


@app.get("/api/demos")
async def list_demos():
    """Return demo entries with recent cached scan ids and basic summary if present."""
    demos = []
    for repo in DEMO_REPOS:
        scan_id = await store.get_recent_complete_scan(repo, max_age_hours=24)
        if scan_id:
            res = await store.get_result(scan_id)
            summary = None
            if res:
                packages = res.get("packages", [])
                findings = [p for p in packages if p.get("risk_level") != "healthy"]
                top_risk = None
                if packages:
                    top = sorted(packages, key=lambda p: p.get("risk_score", 0), reverse=True)[0]
                    top_risk = {
                        "name": top.get("name"),
                        "risk_level": top.get("risk_level"),
                        "risk_score": top.get("risk_score"),
                    }
                score = res.get("overall_score")
                if score is None and packages:
                    score = round(
                        sum(float(p.get("risk_score", 0) or 0) for p in packages) / len(packages),
                        1,
                    )
                summary = {
                    "score": score if score is not None else 0.0,
                    "package_count": len(packages),
                    "findings_count": len(findings),
                    "critical_count": res.get("critical_count", 0),
                    "warning_count": res.get("warning_count", 0),
                    "top_risk": top_risk,
                }
            demos.append({"repo": repo, "scan_id": scan_id, "summary": summary})
        else:
            demos.append({"repo": repo, "scan_id": None, "summary": None})

    return {"demos": demos}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("BACKEND_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
