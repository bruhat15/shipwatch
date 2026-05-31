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
