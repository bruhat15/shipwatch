"""
LLM Summarizer — Uses Gemini to generate human-readable risk summaries
and actionable recommendations for risky dependencies.
"""

import os
import json
from google import genai


async def generate_summary(package_data: dict) -> dict:
    """Generate an AI summary and recommendation for a risky package."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {
            "summary": "AI summary unavailable (no API key configured).",
            "recommendation": "Configure GEMINI_API_KEY for AI-powered recommendations.",
        }

    client = genai.Client(api_key=api_key)

    # Build context about the package
    context = _build_context(package_data)

    prompt = f"""You are ShipWatch, a dependency security advisor. Analyze this package and provide:
1. A concise 2-3 sentence summary of the risks
2. A specific, actionable recommendation

Package analysis:
{context}

Respond in JSON format:
{{
    "summary": "2-3 sentence risk summary",
    "recommendation": "Specific actionable recommendation"
}}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        text = response.text.strip()
        # Try to parse JSON from response
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    except Exception as e:
        return {
            "summary": f"Analysis: {package_data.get('name', 'Unknown')} has "
                       f"{package_data.get('vuln_count', 0)} known vulnerabilities "
                       f"with highest severity: {package_data.get('highest_severity', 'unknown')}.",
            "recommendation": "Review the vulnerability details and consider updating or replacing this package.",
        }


def _build_context(pkg: dict) -> str:
    """Build a text context from package data for the LLM."""
    lines = [
        f"Package: {pkg.get('name', 'Unknown')} v{pkg.get('version', '?')}",
        f"Risk Level: {pkg.get('risk_level', 'unknown').upper()}",
        f"Risk Score: {pkg.get('risk_score', 0)}/10",
    ]

    # Security info
    vuln_count = pkg.get("vuln_count", 0)
    if vuln_count > 0:
        lines.append(f"\nSecurity: {vuln_count} known vulnerabilities")
        lines.append(f"Highest severity: {pkg.get('highest_severity', 'unknown')}")
        for v in pkg.get("vulnerabilities", [])[:3]:
            lines.append(f"  - [{v.get('severity', '?')}] {v.get('id', '?')}: {v.get('summary', 'No description')[:100]}")

    # Maintenance info
    if pkg.get("last_commit"):
        lines.append(f"\nMaintenance:")
        lines.append(f"Last commit: {pkg.get('last_commit', 'unknown')}")
        lines.append(f"Open issues: {pkg.get('open_issues', 'unknown')}")
        lines.append(f"Stars: {pkg.get('stars', 'unknown')}")

    # Ecosystem info
    lines.append(f"\nEcosystem:")
    lines.append(f"Weekly downloads: {pkg.get('weekly_downloads', 'unknown')}")
    lines.append(f"Maintainers: {pkg.get('maintainers_count', 'unknown')}")
    lines.append(f"License: {pkg.get('license', 'unknown')}")
    if pkg.get("deprecated"):
        lines.append("⚠️ DEPRECATED on npm")

    return "\n".join(lines)
