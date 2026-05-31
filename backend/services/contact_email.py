"""
Contact email sender — sends contact form submissions via SMTP.
"""

import os
import smtplib
from email.message import EmailMessage


class ContactEmailError(RuntimeError):
    pass


def _get_env(key: str, required: bool = True) -> str | None:
    value = os.getenv(key)
    if required and not value:
        raise ContactEmailError(f"{key} is not configured")
    return value


def send_contact_email(name: str, email: str, message: str) -> None:
    host = _get_env("SMTP_HOST")
    port = int(_get_env("SMTP_PORT") or 587)
    user = _get_env("SMTP_USER")
    password = _get_env("SMTP_PASSWORD")
    sender = _get_env("SMTP_FROM") or user
    to_email = os.getenv("CONTACT_TO_EMAIL", "kulkarnibruhat@gmail.com")
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

    if not sender:
        raise ContactEmailError("SMTP_FROM is not configured")

    msg = EmailMessage()
    msg["Subject"] = f"ShipWatch contact request from {name}"
    msg["From"] = sender
    msg["To"] = to_email
    msg["Reply-To"] = email
    msg.set_content(
        "\n".join(
            [
                "New ShipWatch contact request",
                "",
                f"Name: {name}",
                f"Email: {email}",
                "",
                "Message:",
                message,
            ]
        )
    )

    try:
        with smtplib.SMTP(host, port) as smtp:
            if use_tls:
                smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(msg)
    except Exception as exc:
        raise ContactEmailError("Failed to send contact email") from exc

def send_magic_link(email: str, token: str, redirect_path: str) -> None:
    host = _get_env("SMTP_HOST")
    port = int(_get_env("SMTP_PORT") or 587)
    user = _get_env("SMTP_USER")
    password = _get_env("SMTP_PASSWORD")
    sender = _get_env("SMTP_FROM") or user
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

    if not sender:
        raise ContactEmailError("SMTP_FROM is not configured")

    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    import urllib.parse
    verify_url = f"{backend_url}/api/auth/email/verify?token={token}&redirect={urllib.parse.quote(redirect_path)}"

    msg = EmailMessage()
    msg["Subject"] = "Sign in to ShipWatch"
    msg["From"] = sender
    msg["To"] = email
    
    html_content = f"""
    <html>
      <body>
        <h2>Sign in to ShipWatch</h2>
        <p>Click the link below to sign in securely. This link expires in 15 minutes.</p>
        <p><a href="{verify_url}" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;">Sign in to ShipWatch</a></p>
        <p><small>If you did not request this email, please ignore it.</small></p>
      </body>
    </html>
    """
    msg.add_alternative(html_content, subtype='html')

    try:
        with smtplib.SMTP(host, port) as smtp:
            if use_tls:
                smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(msg)
    except Exception as exc:
        raise ContactEmailError("Failed to send magic link email") from exc

