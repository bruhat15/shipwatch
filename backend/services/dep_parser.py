"""
Dependency Parser — Extracts dependencies from GitHub repositories.
Supports package.json (npm/Node.js).
"""

import re
import json
import httpx


async def parse_dependencies_from_url(repo_url: str) -> list[dict]:
    """
    Given a GitHub repo URL, fetch package.json and parse dependencies.
    Returns a list of {name, version, github_repo, ecosystem} dicts.
    """
    pkg = await try_fetch_package_json(repo_url)
    if not pkg:
        return []

    deps_by_type: dict[str, tuple] = {}
    # Track which section each dep came from; production wins over dev
    for name, version_spec in (pkg.get("dependencies") or {}).items():
        deps_by_type[name] = (version_spec, "production")
    for name, version_spec in (pkg.get("devDependencies") or {}).items():
        if name not in deps_by_type:
            deps_by_type[name] = (version_spec, "dev")

    results = []
    for name, (version_spec, dep_type) in deps_by_type.items():
        # Clean version spec (remove ^, ~, >=, etc.)
        clean_version = re.sub(r"[^0-9.]", "", version_spec).strip(".")

        results.append({
            "name": name,
            "version": clean_version or version_spec,
            "version_spec": version_spec,
            "ecosystem": "npm",
            "dep_type": dep_type,       # "production" or "dev"
            "github_repo": None,        # Will be enriched later from npm metadata
        })

    return results


def _repo_url_to_raw(repo_url: str, file_path: str) -> str:
    """Convert a GitHub repo URL to a raw content URL."""
    # Handle various GitHub URL formats
    url = repo_url.rstrip("/")

    # Remove .git suffix
    if url.endswith(".git"):
        url = url[:-4]

    # Extract owner/repo
    match = re.search(r"github\.com/([^/]+)/([^/]+)", url)
    if not match:
        raise ValueError(f"Cannot parse GitHub URL: {repo_url}")

    owner, repo = match.group(1), match.group(2)

    # Try main branch first, fall back to master
    return f"https://raw.githubusercontent.com/{owner}/{repo}/main/{file_path}"


async def try_fetch_package_json(repo_url: str) -> dict | None:
    """Try fetching package.json, trying main then master branch."""
    for branch in ("main", "master"):
        url = repo_url.rstrip("/")
        if url.endswith(".git"):
            url = url[:-4]

        match = re.search(r"github\.com/([^/]+)/([^/]+)", url)
        if not match:
            return None

        owner, repo = match.group(1), match.group(2)
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/package.json"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(raw_url)
            if resp.status_code == 200:
                try:
                    return json.loads(resp.text)
                except json.JSONDecodeError:
                    continue

    return None
