import asyncio
import os
import tempfile

import pytest

from services.scan_store import ScanStore


@pytest.mark.asyncio
async def test_upsert_user_links_providers_by_email_and_provider_id():
    tf = tempfile.NamedTemporaryFile(delete=False)
    db_path = tf.name
    tf.close()

    store = ScanStore(db_path=db_path)
    await store.init()

    # Create a github user
    user1 = await store.upsert_user(
        provider="github",
        provider_id="github_123",
        email="bruhat@example.com",
        name="Bruhat",
        avatar_url=None,
        oauth_token="gh-token",
    )

    # Now upsert via google with same email; should link to same user
    user2 = await store.upsert_user(
        provider="google",
        provider_id="google_456",
        email="bruhat@example.com",
        name="Bruhat G",
        avatar_url=None,
        oauth_token="google-token",
    )

    assert user1["id"] == user2["id"]

    await store.close()
    os.unlink(db_path)


@pytest.mark.asyncio
async def test_delete_scans_by_repo_removes_all_entries():
    tf = tempfile.NamedTemporaryFile(delete=False)
    db_path = tf.name
    tf.close()

    store = ScanStore(db_path=db_path)
    await store.init()

    # create a user directly
    user = await store.upsert_user(
        provider="github",
        provider_id="guser",
        email="u@example.com",
        name="U",
        avatar_url=None,
        oauth_token=None,
    )

    user_id = user["id"]

    # create multiple scans for the same repo
    await store.create_scan("s1", "https://github.com/owner/repo", user_id=user_id)
    await store.create_scan("s2", "https://github.com/owner/repo", user_id=user_id)
    await store.create_scan("s3", "https://github.com/owner/other", user_id=user_id)

    deleted = await store.delete_scans_by_repo(user_id, "https://github.com/owner/repo")
    assert deleted >= 2

    remaining = await store.list_scans_by_user(user_id)
    assert all(not s["repo_url"].endswith("/repo") for s in remaining)

    await store.close()
    os.unlink(db_path)
