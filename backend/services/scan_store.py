"""
Scan Store — Simple SQLite-backed storage for scan results.
"""

import json
import uuid
import os
import aiosqlite

DB_PATH = os.getenv("DB_PATH", "shipwatch.db")


class ScanStore:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.db = None

    async def init(self):
        """Initialize database and create tables."""
        self.db = await aiosqlite.connect(self.db_path)
        await self.db.execute("PRAGMA foreign_keys = ON")
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                github_id TEXT UNIQUE,
                google_id TEXT UNIQUE,
                email TEXT,
                name TEXT,
                avatar_url TEXT,
                github_token TEXT,
                google_token TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                scan_id TEXT PRIMARY KEY,
                repo_url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                result_json TEXT,
                error_message TEXT,
                total_deps INTEGER DEFAULT 0,
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await self._ensure_scan_columns()
        await self.db.commit()

    async def close(self):
        if self.db:
            await self.db.close()

    async def create_scan(self, scan_id: str, repo_url: str, user_id: str | None = None):
        await self.db.execute(
            "INSERT INTO scans (scan_id, repo_url, status, user_id) VALUES (?, ?, 'pending', ?)",
            (scan_id, repo_url, user_id),
        )
        await self.db.commit()

    async def update_status(self, scan_id: str, status: str, error_message: str = None):
        if error_message:
            await self.db.execute(
                "UPDATE scans SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE scan_id = ?",
                (status, error_message, scan_id),
            )
        else:
            await self.db.execute(
                "UPDATE scans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE scan_id = ?",
                (status, scan_id),
            )
        await self.db.commit()

    async def update_deps_count(self, scan_id: str, count: int):
        await self.db.execute(
            "UPDATE scans SET total_deps = ? WHERE scan_id = ?",
            (count, scan_id),
        )
        await self.db.commit()

    async def save_result(self, scan_id: str, result):
        result_json = result.model_dump_json() if hasattr(result, 'model_dump_json') else json.dumps(result)
        await self.db.execute(
            "UPDATE scans SET status = 'complete', result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE scan_id = ?",
            (result_json, scan_id),
        )
        await self.db.commit()

    async def append_package_result(self, scan_id: str, package: dict, status: str | None = None, total_deps: int | None = None) -> None:
        """
        Append a single package's partial result into the stored `result_json` for a scan.
        Creates a minimal result JSON structure if none exists yet.
        """
        async with self.db.execute("SELECT result_json, total_deps, repo_url FROM scans WHERE scan_id = ?", (scan_id,)) as cursor:
            row = await cursor.fetchone()

        if row:
            current_json, current_total, repo_url = row
        else:
            current_json, current_total, repo_url = (None, None, None)

        if current_json:
            try:
                obj = json.loads(current_json)
            except Exception:
                obj = {}
        else:
            obj = {
                "scan_id": scan_id,
                "repo_url": repo_url or "",
                "repo_name": (repo_url or "").rstrip("/").split("/")[-1] if repo_url else "",
                "status": status or "scoring",
                "scanned_at": None,
                "total_deps": total_deps or (current_total or 0),
                "critical_count": 0,
                "warning_count": 0,
                "healthy_count": 0,
                "packages": [],
            }

        # Update counts and status if provided
        if status:
            obj["status"] = status
        if total_deps is not None:
            obj["total_deps"] = total_deps

        # Append package (replace if same name exists)
        packages = obj.get("packages") or []
        existing_idx = next((i for i, p in enumerate(packages) if p.get("name") == package.get("name")), None)
        if existing_idx is not None:
            packages[existing_idx] = package
        else:
            packages.append(package)

        obj["packages"] = packages

        # Update simple counters
        obj["critical_count"] = sum(1 for p in packages if p.get("risk_level") == "critical")
        obj["warning_count"] = sum(1 for p in packages if p.get("risk_level") == "warning")
        obj["healthy_count"] = sum(1 for p in packages if p.get("risk_level") == "healthy")

        await self.db.execute(
            "UPDATE scans SET result_json = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE scan_id = ?",
            (json.dumps(obj), status, scan_id),
        )
        await self.db.commit()

    async def get_result(self, scan_id: str) -> dict | None:
        async with self.db.execute(
            "SELECT scan_id, repo_url, status, result_json, error_message, total_deps FROM scans WHERE scan_id = ?",
            (scan_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None

            scan_id, repo_url, status, result_json, error_message, total_deps = row

            if result_json:
                obj = json.loads(result_json)
                packages = obj.get("packages") or []
                for pkg in packages:
                    if pkg.get("scan_id") is None:
                        pkg["scan_id"] = scan_id
                obj["packages"] = packages
                return obj

            return {
                "scan_id": scan_id,
                "repo_url": repo_url,
                "status": status,
                "error_message": error_message,
                "total_deps": total_deps,
                "packages": [],
            }

    async def list_scans(self) -> list[dict]:
        async with self.db.execute(
            "SELECT scan_id, repo_url, status, total_deps, created_at FROM scans ORDER BY created_at DESC LIMIT 20"
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "scan_id": r[0],
                    "repo_url": r[1],
                    "status": r[2],
                    "total_deps": r[3],
                    "created_at": r[4],
                }
                for r in rows
            ]

    async def list_scans_by_user(self, user_id: str) -> list[dict]:
        async with self.db.execute(
            "SELECT scan_id, repo_url, status, total_deps, created_at FROM scans WHERE user_id = ? ORDER BY created_at DESC, scan_id DESC",
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()

        grouped: list[dict] = []
        counts: dict[str, int] = {}
        seen: set[str] = set()

        for scan_id, repo_url, status, total_deps, created_at in rows:
            counts[repo_url] = counts.get(repo_url, 0) + 1
            if repo_url in seen:
                continue
            seen.add(repo_url)
            grouped.append(
                {
                    "scan_id": scan_id,
                    "repo_url": repo_url,
                    "status": status,
                    "total_deps": total_deps,
                    "created_at": created_at,
                    "scan_count": counts[repo_url],
                }
            )

        for item in grouped:
            item["scan_count"] = counts.get(item["repo_url"], 1)

        return grouped

    async def delete_scans_by_repo(self, user_id: str, repo_url: str) -> int:
        cursor = await self.db.execute(
            "DELETE FROM scans WHERE user_id = ? AND repo_url = ?",
            (user_id, repo_url),
        )
        await self.db.commit()
        return cursor.rowcount or 0

    async def get_recent_complete_scan(self, repo_url: str, max_age_hours: int = 24) -> str | None:
        """Return a recent completed scan_id for the given repo_url if it exists within max_age_hours."""
        async with self.db.execute(
            "SELECT scan_id, updated_at FROM scans WHERE repo_url = ? AND status = 'complete' ORDER BY updated_at DESC LIMIT 1",
            (repo_url,),
        ) as cursor:
            row = await cursor.fetchone()

        if not row:
            return None

        scan_id, updated_at = row
        try:
            # updated_at stored as TEXT timestamp; attempt to parse
            from datetime import datetime, timezone
            if isinstance(updated_at, str):
                # Try common formats
                try:
                    ts = datetime.fromisoformat(updated_at)
                except Exception:
                    try:
                        ts = datetime.strptime(updated_at, "%Y-%m-%d %H:%M:%S")
                    except Exception:
                        return scan_id
            else:
                ts = updated_at

            age_hours = (datetime.now(ts.tzinfo or timezone.utc) - ts).total_seconds() / 3600.0
            if age_hours <= max_age_hours:
                return scan_id
        except Exception:
            return scan_id

        return None

    async def get_scan_user(self, scan_id: str) -> str | None:
        async with self.db.execute("SELECT user_id FROM scans WHERE scan_id = ?", (scan_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return row[0]
        return None

    async def clone_scan(self, original_scan_id: str, new_scan_id: str, new_user_id: str | None) -> bool:
        """Clone an existing scan to a new scan ID with a new user ID."""
        async with self.db.execute(
            "SELECT repo_url, status, result_json, error_message, total_deps FROM scans WHERE scan_id = ?",
            (original_scan_id,)
        ) as cursor:
            row = await cursor.fetchone()
            
        if not row:
            return False
            
        repo_url, status, result_json, error_message, total_deps = row
        
        if result_json:
            try:
                obj = json.loads(result_json)
                obj["scan_id"] = new_scan_id
                for pkg in obj.get("packages", []):
                    pkg["scan_id"] = new_scan_id
                result_json = json.dumps(obj)
            except Exception:
                pass
                
        await self.db.execute(
            """INSERT INTO scans 
               (scan_id, repo_url, status, result_json, error_message, total_deps, user_id) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (new_scan_id, repo_url, status, result_json, error_message, total_deps, new_user_id)
        )
        await self.db.commit()
        return True

    async def upsert_user(
        self,
        provider: str,
        provider_id: str,
        email: str | None,
        name: str | None,
        avatar_url: str | None,
        oauth_token: str | None,
        target_user_id: str | None = None,
    ) -> dict:
        if not provider_id:
            raise ValueError("provider_id is required")

        id_col, token_col = self._provider_columns(provider)

        user_id = target_user_id
        if not user_id:
            async with self.db.execute(
                f"SELECT id FROM users WHERE {id_col} = ?",
                (provider_id,),
            ) as cursor:
                row = await cursor.fetchone()
            if row:
                user_id = row[0]
            elif email:
                async with self.db.execute(
                    "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
                    (email,),
                ) as cursor:
                    row = await cursor.fetchone()
                if row:
                    user_id = row[0]

        if user_id:
            async with self.db.execute("SELECT id FROM users WHERE id = ?", (user_id,)) as cursor:
                row = await cursor.fetchone()
            if not row:
                raise ValueError("Target user not found")
            # If this provider_id is already linked to a different user, detach it first
            async with self.db.execute(f"SELECT id FROM users WHERE {id_col} = ?", (provider_id,)) as cursor:
                existing = await cursor.fetchone()
            if existing and existing[0] != user_id:
                await self.db.execute(
                    f"UPDATE users SET {id_col} = NULL, {token_col} = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (existing[0],),
                )

            await self.db.execute(
                f"""
                UPDATE users
                SET email = COALESCE(?, email),
                    name = COALESCE(?, name),
                    avatar_url = COALESCE(?, avatar_url),
                    {id_col} = ?,
                    {token_col} = COALESCE(?, {token_col}),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (email, name, avatar_url, provider_id, oauth_token, user_id),
            )
        else:
            user_id = str(uuid.uuid4())
            # If provider_id already exists on another user, reuse that user id (avoid UNIQUE error)
            async with self.db.execute(f"SELECT id FROM users WHERE {id_col} = ?", (provider_id,)) as cursor:
                existing = await cursor.fetchone()
            if existing:
                user_id = existing[0]
                await self.db.execute(
                    f"""
                    UPDATE users
                    SET email = COALESCE(?, email),
                        name = COALESCE(?, name),
                        avatar_url = COALESCE(?, avatar_url),
                        {token_col} = COALESCE(?, {token_col}),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (email, name, avatar_url, oauth_token, user_id),
                )
            else:
                await self.db.execute(
                    f"""
                    INSERT INTO users (id, {id_col}, email, name, avatar_url, {token_col})
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, provider_id, email, name, avatar_url, oauth_token),
                )

        await self.db.commit()
        user = await self.get_user(user_id)
        if not user:
            raise ValueError("Failed to load user after upsert")
        return user

    async def get_user(self, user_id: str) -> dict | None:
        async with self.db.execute(
            "SELECT id, email, name, avatar_url, github_id, google_id FROM users WHERE id = ?",
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None

            return {
                "id": row[0],
                "email": row[1],
                "name": row[2],
                "avatar_url": row[3],
                "github_id": row[4],
                "google_id": row[5],
            }

    async def get_user_oauth_token(self, user_id: str, provider: str) -> str | None:
        token_col = "github_token" if provider == "github" else "google_token" if provider == "google" else None
        if not token_col:
            raise ValueError("Unsupported provider")

        async with self.db.execute(
            f"SELECT {token_col} FROM users WHERE id = ?",
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return row[0]

    async def _ensure_scan_columns(self) -> None:
        async with self.db.execute("PRAGMA table_info(scans)") as cursor:
            columns = [row[1] for row in await cursor.fetchall()]
        if "user_id" not in columns:
            await self.db.execute("ALTER TABLE scans ADD COLUMN user_id TEXT")

    def _provider_columns(self, provider: str) -> tuple[str, str]:
        if provider == "github":
            return "github_id", "github_token"
        if provider == "google":
            return "google_id", "google_token"
        raise ValueError("Unsupported provider")

    async def disconnect_provider(self, user_id: str, provider: str) -> None:
        id_col, token_col = self._provider_columns(provider)
        # Nullify both the provider id and token for the given user
        await self.db.execute(
            f"UPDATE users SET {id_col} = NULL, {token_col} = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,),
        )
        await self.db.commit()
