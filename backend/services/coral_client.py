"""
Coral Client — Executes SQL queries through the Coral CLI.
Wraps `coral sql` commands and parses JSON output.
Falls back to direct API calls if Coral CLI is not available.
"""

import os
import json
import asyncio
import subprocess
import httpx


class CoralClient:
    """Client for executing Coral SQL queries."""

    def __init__(self):
        self.coral_path = os.getenv("CORAL_CLI_PATH", "coral")
        self._use_fallback = False

    def _normalize_bool(self, value) -> bool:
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

    async def query(self, sql: str) -> list[dict]:
        """Execute a Coral SQL query and return results as list of dicts."""
        if self._use_fallback:
            return []

        try:
            stdout = await self._run_coral_sql(sql)
            if stdout is None:
                self._use_fallback = True
                return []

            if not stdout.strip():
                return []

            return json.loads(stdout)

        except FileNotFoundError:
            print("[Coral] CLI not found — using direct API fallback")
            self._use_fallback = True
            return []
        except json.JSONDecodeError:
            print(f"[Coral] Failed to parse JSON output")
            return []
        except subprocess.TimeoutExpired:
            print(f"[Coral] Query timed out")
            return []

    async def _run_coral_sql(self, sql: str) -> str | None:
        """Execute a Coral SQL query and return raw JSON output."""
        # `coral sql --format json <SQL>` is the correct invocation.
        # Fallback to table format if JSON flag fails (graceful degradation).
        commands = [
            [self.coral_path, "sql", "--format", "json", sql],
            [self.coral_path, "sql", sql],  # table format fallback (parsed as plain text)
        ]

        last_error = None
        for cmd in commands:
            result = await asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if result.returncode == 0:
                return result.stdout

            last_error = result.stderr or result.stdout
            if last_error and any(
                flag in last_error for flag in (
                    "unexpected argument",
                    "unknown flag",
                    "unrecognized option",
                )
            ):
                continue  # Try next command variant

        if last_error:
            print(f"[Coral] Query error: {last_error.strip()}")
        return None


    async def query_github_health(self, full_name: str) -> dict:
        """Query GitHub health metrics for a repo via Coral."""
        owner, repo = full_name.split("/", 1) if "/" in full_name else (full_name, "")

        # Try Coral first
        if not self._use_fallback and repo:
            sql = f"""
                SELECT full_name, stargazers_count, open_issues_count,
                       pushed_at, description
                FROM github.repos
                WHERE owner = '{owner}' AND repo = '{repo}'
                LIMIT 1
            """
            rows = await self.query(sql)
            if rows:
                r = rows[0]
                return {
                    "stars": r.get("stargazers_count", 0),
                    "open_issues": r.get("open_issues_count", 0),
                    "last_commit": r.get("pushed_at", ""),
                    "github_repo": full_name,
                }

        # Fallback: direct GitHub API
        return await self._github_api_fallback(full_name)

    async def _github_api_fallback(self, full_name: str) -> dict:
        """Direct GitHub API call as fallback."""
        token = os.getenv("GITHUB_TOKEN", "")
        headers = {"Accept": "application/vnd.github.v3+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{full_name}",
                headers=headers,
            )
            if resp.status_code != 200:
                return {}

            data = resp.json()
            return {
                "stars": data.get("stargazers_count", 0),
                "open_issues": data.get("open_issues_count", 0),
                "last_commit": data.get("pushed_at", ""),
                "github_repo": full_name,
                "contributors_count": None,  # Needs separate API call
            }

    async def query_scorecard(self, full_name: str) -> float | None:
        """Query free OpenSSF Scorecard API for project health score.
        Returns 0-10 float (10=best) or None if unavailable.
        API: GET https://api.securityscorecards.dev/projects/github.com/{owner}/{repo}
        No auth needed. Free."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://api.securityscorecards.dev/projects/github.com/{full_name}"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("score")  # float 0-10
        except Exception:
            pass
        return None


    async def query_vulnerabilities(self, package_name: str, ecosystem: str = "npm") -> dict:
        """Query OSV for vulnerabilities via Coral or direct API."""
        # Try Coral first
        if not self._use_fallback:
            sql = f"""
                SELECT id, summary, severity, published, fixed_version, aliases
                FROM osv.vulnerabilities
                WHERE package_name = '{package_name}' AND ecosystem = '{ecosystem}'
            """
            rows = await self.query(sql)
            if rows:
                return self._format_vuln_results(rows)

        # Fallback: direct OSV API
        return await self._osv_api_fallback(package_name, ecosystem)

    async def _osv_api_fallback(self, package_name: str, ecosystem: str) -> dict:
        """Direct OSV API call as fallback."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.osv.dev/v1/query",
                json={"package": {"name": package_name, "ecosystem": ecosystem}},
            )
            if resp.status_code != 200:
                return {"vulnerabilities": [], "vuln_count": 0, "highest_severity": None}

            data = resp.json()
            vulns = data.get("vulns", [])

            formatted_vulns = []
            highest = None
            severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

            for v in vulns:
                sev = None
                cvss_score = None

                # Try to get severity from database_specific
                db_spec = v.get("database_specific", {})
                sev = db_spec.get("severity", None)

                # Try CVSS if no severity field — also extract numeric score
                if v.get("severity"):
                    for s in v["severity"]:
                        if s.get("type") == "CVSS_V3":
                            try:
                                cvss_score = float(s.get("score", "0"))
                            except (ValueError, TypeError):
                                cvss_score = None
                            if cvss_score and not sev:
                                if cvss_score >= 9.0:
                                    sev = "CRITICAL"
                                elif cvss_score >= 7.0:
                                    sev = "HIGH"
                                elif cvss_score >= 4.0:
                                    sev = "MEDIUM"
                                else:
                                    sev = "LOW"

                if not sev:
                    sev = "MEDIUM"  # Default if unknown

                if highest is None or severity_order.get(sev, 0) > severity_order.get(highest, 0):
                    highest = sev

                # Extract fixed_version from affected ranges
                fixed_version = None
                for affected in v.get("affected", []):
                    for rng in affected.get("ranges", []):
                        for event in rng.get("events", []):
                            if "fixed" in event:
                                fixed_version = event["fixed"]

                formatted_vulns.append({
                    "id": v.get("id", ""),
                    "summary": v.get("summary", "No description"),
                    "severity": sev,
                    "cvss_score": cvss_score,
                    "fixed_version": fixed_version,
                    "published": v.get("published", ""),
                    "aliases": ", ".join(v.get("aliases", [])),
                })

            return {
                "vulnerabilities": formatted_vulns,
                "vuln_count": len(formatted_vulns),
                "highest_severity": highest,
            }

    def _format_vuln_results(self, rows: list[dict]) -> dict:
        """Format Coral query results into vulnerability data."""
        severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
        highest = None

        vulns = []
        for r in rows:
            sev = r.get("severity", "MEDIUM")
            if highest is None or severity_order.get(sev, 0) > severity_order.get(highest, 0):
                highest = sev
            vulns.append({
                "id": r.get("id", ""),
                "summary": r.get("summary", ""),
                "severity": sev,
                "published": r.get("published", ""),
                "fixed_version": r.get("fixed_version", ""),
                "aliases": r.get("aliases", ""),
            })

        return {
            "vulnerabilities": vulns,
            "vuln_count": len(vulns),
            "highest_severity": highest,
        }

    async def query_npm_metadata(self, package_name: str) -> dict:
        """Query npm package metadata via Coral or direct API."""
        # Try Coral first
        if not self._use_fallback:
            sql = f"""
                SELECT
                    name,
                    version,
                    license,
                    json_length(maintainers) AS maintainers_count,
                    repository_url,
                    last_publish,
                    deprecated
                FROM npm.packages
                WHERE name = '{package_name}'
            """
            rows = await self.query(sql)
            if rows:
                r = rows[0]
                repo_url = r.get("repository_url")
                github_repo = self._extract_github_repo({"repository": repo_url}) if repo_url else None
                result = {
                    "license": r.get("license"),
                    "maintainers_count": r.get("maintainers_count"),
                    "deprecated": self._normalize_bool(r.get("deprecated")),
                    "github_repo": github_repo,
                }

                downloads = await self._npm_downloads_fallback(package_name)
                result.update(downloads)
                return result

        # Fallback: direct npm API
        return await self._npm_api_fallback(package_name)

    async def _npm_api_fallback(self, package_name: str) -> dict:
        """Direct npm registry API call as fallback."""
        async with httpx.AsyncClient(timeout=15) as client:
            # Get package metadata
            resp = await client.get(f"https://registry.npmjs.org/{package_name}")
            if resp.status_code != 200:
                return {}

            data = resp.json()
            latest_version = data.get("dist-tags", {}).get("latest", "")
            version_data = data.get("versions", {}).get(latest_version, {})

            result = {
                "license": data.get("license", version_data.get("license")),
                "maintainers_count": len(data.get("maintainers", [])),
                "deprecated": self._normalize_bool(version_data.get("deprecated")),
                "github_repo": self._extract_github_repo(data),
            }

            # Get download stats
            try:
                dl_resp = await client.get(
                    f"https://api.npmjs.org/downloads/point/last-month/{package_name}"
                )
                if dl_resp.status_code == 200:
                    result["weekly_downloads"] = dl_resp.json().get("downloads", 0)
            except Exception:
                pass

            return result

    async def _npm_downloads_fallback(self, package_name: str) -> dict:
        """Fetch npm download stats as a lightweight fallback."""
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.get(
                    f"https://api.npmjs.org/downloads/point/last-month/{package_name}"
                )
                if resp.status_code == 200:
                    return {"weekly_downloads": resp.json().get("downloads", 0)}
            except Exception:
                return {}

        return {}

    def _extract_github_repo(self, npm_data: dict) -> str | None:
        """Extract GitHub owner/repo from npm package data."""
        repo = npm_data.get("repository", {})
        url = repo.get("url", "") if isinstance(repo, dict) else str(repo)

        if "github.com" in url:
            import re
            match = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", url)
            if match:
                return f"{match.group(1)}/{match.group(2)}"
        return None

    def build_display_query(self, deps: list[dict]) -> str:
        """Build a display-friendly SQL query showing what Coral does."""
        dep_names = [d["name"] for d in deps[:5]]
        names_str = ", ".join(f"'{n}'" for n in dep_names)
        more = f"  -- ... and {len(deps) - 5} more packages" if len(deps) > 5 else ""

        return f"""-- ShipWatch: Cross-source dependency audit via Coral
-- Joining GitHub health + OSV vulnerabilities + npm ecosystem data

SELECT
    npm.name                AS package,
    npm.version             AS latest_version,
    npm.weekly_downloads    AS downloads,
    npm.maintainers_count   AS maintainers,
    gh.stargazers_count     AS stars,
    gh.open_issues_count    AS open_issues,
    gh.pushed_at            AS last_commit,
    osv.id                  AS vuln_id,
    osv.severity            AS vuln_severity,
    osv.summary             AS vulnerability
FROM npm.packages npm
LEFT JOIN github.repos gh
    ON gh.full_name = npm.repository_url
LEFT JOIN osv.vulnerabilities osv
    ON osv.package_name = npm.name
    AND osv.ecosystem = 'npm'
WHERE npm.name IN ({names_str})
{more}
ORDER BY
    CASE osv.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        ELSE 4
    END NULLS LAST,
    gh.pushed_at ASC;"""
