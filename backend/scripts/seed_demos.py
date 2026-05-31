"""Seed demo scans locally by invoking the pipeline.

Usage:
    python -m backend.scripts.seed_demos

This script will initialize the ScanStore, create scan rows for the demo repos
(if not present within 24h) and run the pipeline synchronously for each.

Warning: running this will perform network calls to GitHub/OSV/npm and may take
some time depending on network and rate limits.
"""

import asyncio
import uuid
import os

# Ensure this file can import the package by adjusting PYTHONPATH if needed
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import store, run_scan_pipeline

DEMO_REPOS = [
    "https://github.com/expressjs/express",
    "https://github.com/vercel/next.js",
    "https://github.com/fastify/fastify",
]

async def main():
    await store.init()
    try:
        for repo in DEMO_REPOS:
            cached = await store.get_recent_complete_scan(repo, max_age_hours=24)
            if cached:
                print(f"Skipping {repo}, cached scan: {cached}")
                continue

            scan_id = str(uuid.uuid4())[:8]
            print(f"Creating and running scan {scan_id} for {repo}")
            await store.create_scan(scan_id, repo, user_id=None)
            # Run pipeline synchronously (may take time)
            await run_scan_pipeline(scan_id, repo)
            print(f"Completed scan {scan_id} for {repo}")
    finally:
        await store.close()

if __name__ == "__main__":
    asyncio.run(main())
