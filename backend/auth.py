"""
ShipWatch Auth - OAuth (GitHub, Google) + JWT utilities.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

from services.contact_email import send_magic_link

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "72"))
STATE_TOKEN_EXPIRE_MINUTES = 10


auth_router = APIRouter()


class UserPublic(BaseModel):
    id: str
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    github_connected: bool = False
    google_connected: bool = False


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="JWT_SECRET is not configured")
    return secret


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _backend_url() -> str:
    return os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")


def _oauth_redirect_uri(provider: str) -> str:
    return f"{_backend_url()}/api/auth/{provider}/callback"


def _normalize_scopes(value: str) -> list[str]:
    scopes: list[str] = []
    for scope in value.split():
        scope = scope.strip()
        if scope and scope not in scopes:
            scopes.append(scope)
    return scopes


def _github_login_scopes() -> str:
    scopes = [scope for scope in _normalize_scopes(os.getenv("GITHUB_OAUTH_SCOPES", "read:user user:email")) if scope != "repo"]
    return " ".join(scopes or ["read:user", "user:email"])


def _github_connect_scopes() -> str:
    scopes = _normalize_scopes(os.getenv("GITHUB_OAUTH_SCOPES", "read:user user:email"))
    if "repo" not in scopes:
        scopes.append("repo")
    return " ".join(scopes)


def _sanitize_redirect(value: str | None) -> str:
    if not value:
        return "/dashboard"
    if value.startswith("/") and not value.startswith("//"):
        return value
    return "/dashboard"


def _create_token(payload: dict, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    to_encode = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(to_encode, _jwt_secret(), algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])


def _create_access_token(user_id: str) -> str:
    return _create_token({"sub": user_id, "typ": "access"}, timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))


def _create_state_token(redirect_path: str, action: str = "login", user_id: str | None = None) -> str:
    payload: dict = {"redirect": redirect_path, "typ": "state", "action": action}
    if user_id:
        payload["user_id"] = user_id
    return _create_token(payload, timedelta(minutes=STATE_TOKEN_EXPIRE_MINUTES))


def _decode_state_token(state: str) -> dict | None:
    try:
        data = _decode_token(state)
        if data.get("typ") != "state":
            return None
        return data
    except JWTError:
        return None


def _bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.replace("Bearer ", "", 1).strip()
    return None


async def _get_store(request: Request):
    store = getattr(request.app.state, "store", None)
    if store is None:
        raise HTTPException(status_code=500, detail="Scan store not initialized")
    return store


async def get_current_user(
    request: Request,
    store=Depends(_get_store),
):
    token = _bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = _decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await store.get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


async def get_optional_user(
    request: Request,
    store=Depends(_get_store),
):
    token = _bearer_token(request)
    if not token:
        return None

    try:
        payload = _decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await store.get_user(user_id)
        return user
    except JWTError:
        return None


@auth_router.get("/me", response_model=UserPublic)
async def get_me(current_user=Depends(get_current_user)):
    # current_user is a dict from ScanStore.get_user which may include provider ids
    return {
        "id": current_user.get("id"),
        "email": current_user.get("email"),
        "name": current_user.get("name"),
        "avatar_url": current_user.get("avatar_url"),
        "github_connected": bool(current_user.get("github_id")),
        "google_connected": bool(current_user.get("google_id")),
    }



@auth_router.delete("/provider")
async def disconnect_provider(provider: str, current_user=Depends(get_current_user), store=Depends(_get_store)):
    if provider not in ("github", "google"):
        raise HTTPException(status_code=400, detail="Unsupported provider")
    await store.disconnect_provider(current_user["id"], provider)
    return {"status": "ok"}


@auth_router.get("/github")
async def github_login(redirect: str | None = None):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID is not configured")

    redirect_path = _sanitize_redirect(redirect)
    state = _create_state_token(redirect_path, action="login")

    params = {
        "client_id": client_id,
        "redirect_uri": _oauth_redirect_uri("github"),
        "scope": _github_login_scopes(),
        "state": state,
        "allow_signup": "true",
    }

    url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url)


@auth_router.get("/github/connect")
async def github_connect(request: Request, redirect: str | None = None, current_user=Depends(get_current_user)):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID is not configured")

    redirect_path = _sanitize_redirect(redirect)
    state = _create_state_token(redirect_path, action="connect", user_id=current_user["id"])

    params = {
        "client_id": client_id,
        "redirect_uri": _oauth_redirect_uri("github"),
        "scope": _github_connect_scopes(),
        "state": state,
        "allow_signup": "true",
    }

    url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url)


@auth_router.get("/github/connect-url")
async def github_connect_url(request: Request, redirect: str | None = None, current_user=Depends(get_current_user)):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID is not configured")

    redirect_path = _sanitize_redirect(redirect)
    state = _create_state_token(redirect_path, action="connect", user_id=current_user["id"])

    params = {
        "client_id": client_id,
        "redirect_uri": _oauth_redirect_uri("github"),
        "scope": _github_connect_scopes(),
        "state": state,
        "allow_signup": "true",
    }

    url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return {"url": url}


@auth_router.get("/github/callback")
async def github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        return _redirect_with_error(error)
    if not code:
        return _redirect_with_error("Missing OAuth code")

    redirect_path = _redirect_path_from_state(state)

    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth credentials missing")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": _oauth_redirect_uri("github"),
            },
        )

        if token_resp.status_code != 200:
            return _redirect_with_error("GitHub token exchange failed", redirect_path)

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return _redirect_with_error("GitHub access token missing", redirect_path)

        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Accept": "application/vnd.github.v3+json",
                "Authorization": f"Bearer {access_token}",
            },
        )
        if user_resp.status_code != 200:
            return _redirect_with_error("GitHub user fetch failed", redirect_path)

        user_data = user_resp.json()
        email = user_data.get("email")

        if not email:
            try:
                emails_resp = await client.get(
                    "https://api.github.com/user/emails",
                    headers={
                        "Accept": "application/vnd.github.v3+json",
                        "Authorization": f"Bearer {access_token}",
                    },
                )
                if emails_resp.status_code == 200:
                    emails = emails_resp.json()
                    primary = next((e for e in emails if e.get("primary")), None)
                    email = (primary or {}).get("email")
            except Exception:
                pass

    provider_id = user_data.get("id")
    if not provider_id:
        return _redirect_with_error("GitHub user id missing", redirect_path)

    state_data = _decode_state_token(state) if state else None
    connect_user_id = state_data.get("user_id") if state_data and state_data.get("action") == "connect" else None

    store = await _get_store(request)
    user = await store.upsert_user(
        provider="github",
        provider_id=str(provider_id),
        email=email,
        name=user_data.get("name") or user_data.get("login"),
        avatar_url=user_data.get("avatar_url"),
        oauth_token=access_token if connect_user_id else None,
        target_user_id=connect_user_id,
    )

    access_jwt = _create_access_token(user["id"])
    return _redirect_with_token(access_jwt, redirect_path)


@auth_router.get("/google")
async def google_login(redirect: str | None = None):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")

    redirect_path = _sanitize_redirect(redirect)
    state = _create_state_token(redirect_path, action="login")

    params = {
        "client_id": client_id,
        "redirect_uri": _oauth_redirect_uri("google"),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url)


@auth_router.get("/google/connect")
async def google_connect(request: Request, redirect: str | None = None, current_user=Depends(get_current_user)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")

    redirect_path = _sanitize_redirect(redirect)
    state = _create_state_token(redirect_path, action="connect", user_id=current_user["id"])

    params = {
        "client_id": client_id,
        "redirect_uri": _oauth_redirect_uri("google"),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url)


@auth_router.get("/google/connect-url")
async def google_connect_url(request: Request, redirect: str | None = None, current_user=Depends(get_current_user)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")

    redirect_path = _sanitize_redirect(redirect)
    state = _create_state_token(redirect_path, action="connect", user_id=current_user["id"])

    params = {
        "client_id": client_id,
        "redirect_uri": _oauth_redirect_uri("google"),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"url": url}


@auth_router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        return _redirect_with_error(error)
    if not code:
        return _redirect_with_error("Missing OAuth code")

    redirect_path = _redirect_path_from_state(state)

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth credentials missing")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": _oauth_redirect_uri("google"),
                "grant_type": "authorization_code",
            },
        )

        if token_resp.status_code != 200:
            return _redirect_with_error("Google token exchange failed", redirect_path)

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return _redirect_with_error("Google access token missing", redirect_path)

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            return _redirect_with_error("Google user fetch failed", redirect_path)

        user_data = user_resp.json()

    provider_id = user_data.get("id")
    if not provider_id:
        return _redirect_with_error("Google user id missing", redirect_path)

    state_data = _decode_state_token(state) if state else None
    connect_user_id = state_data.get("user_id") if state_data and state_data.get("action") == "connect" else None

    store = await _get_store(request)
    user = await store.upsert_user(
        provider="google",
        provider_id=str(provider_id),
        email=user_data.get("email"),
        name=user_data.get("name"),
        avatar_url=user_data.get("picture"),
        oauth_token=access_token if connect_user_id else None,
        target_user_id=connect_user_id,
    )

    access_jwt = _create_access_token(user["id"])
    return _redirect_with_token(access_jwt, redirect_path)


def _redirect_path_from_state(state: str | None) -> str:
    redirect_path = "/dashboard"
    if state:
        state_data = _decode_state_token(state)
        if state_data:
            redirect_path = _sanitize_redirect(state_data.get("redirect"))
    return redirect_path


def _redirect_with_token(token: str, redirect_path: str) -> RedirectResponse:
    params = urlencode({"token": token, "redirect": redirect_path})
    return RedirectResponse(f"{_frontend_url()}/auth/callback?{params}")


def _redirect_with_error(message: str, redirect_path: str | None = None) -> RedirectResponse:
    redirect_path = _sanitize_redirect(redirect_path)
    params = urlencode({"error": message, "redirect": redirect_path})
    return RedirectResponse(f"{_frontend_url()}/auth/callback?{params}")


class EmailRequest(BaseModel):
    email: str
    redirect_path: str = "/dashboard"

@auth_router.post("/email/request")
async def email_request(req: EmailRequest, request: Request):
    store = await _get_store(request)
    import secrets
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    
    await store.create_magic_link(
        token=token,
        email=req.email,
        expires_at=expires_at,
        redirect_path=req.redirect_path
    )
    
    from services.contact_email import send_magic_link
    send_magic_link(req.email, token, req.redirect_path)
    return {"status": "ok"}


@auth_router.get("/email/verify")
async def email_verify(request: Request, token: str, redirect: str | None = None):
    store = await _get_store(request)
    link_data = await store.consume_magic_link(token)
    
    redirect_path = _sanitize_redirect(redirect)
    
    if not link_data:
        return _redirect_with_error("Invalid or expired magic link", redirect_path)
        
    expires_at = datetime.fromisoformat(link_data["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        return _redirect_with_error("Magic link has expired", redirect_path)
        
    email = link_data["email"]
    link_redirect = link_data.get("redirect_path") or redirect_path
    
    # Get or create the user strictly by email
    user_id = await store.get_or_create_user_by_email(email)
    
    access_jwt = _create_access_token(user_id)
    return _redirect_with_token(access_jwt, link_redirect)

