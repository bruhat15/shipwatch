/**
 * ShipWatch API client — communicates with the FastAPI backend.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const AUTH_STORAGE_KEY = "shipwatch_token";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  github_connected?: boolean;
  google_connected?: boolean;
}

export interface LicenseIssue {
  type: "copyleft" | "missing" | "unknown";
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface PackageRisk {
  name: string;
  version: string;
  risk_level: "critical" | "warning" | "healthy";
  risk_score: number; // 0-10 scale
  confidence: "low" | "medium" | "high";
  github_repo: string | null;
  stars: number | null;
  open_issues: number | null;
  last_commit: string | null;
  contributors_count: number | null;
  scorecard_score: number | null; // OpenSSF Scorecard 0-10
  vulnerabilities: Vulnerability[];
  vuln_count: number;
  highest_severity: string | null;
  epss_max_score: number | null;
  in_kev: boolean | null;
  kev_ransomware: boolean | null;
  weekly_downloads: number | null;
  maintainers_count: number | null;
  license: string | null;
  deprecated: boolean;
  dep_type?: "production" | "dev";
  ai_summary: string | null;
  ai_recommendation: string | null;
  license_issues: LicenseIssue[];
  fixes: Fix[];
  decision?: Decision;
  _security_risk?: number;
  _maintenance_risk?: number;
  _ecosystem_risk?: number;
}

export interface Fix {
  type: "upgrade" | "migrate" | "monitor" | "review";
  urgency: "now" | "soon" | "later";
  title: string;
  description: string;
  command: string | null;
}

export interface Vulnerability {
  id: string;
  summary: string;
  severity: string;
  cvss_score: number | null;
  fixed_version?: string;
  published: string;
  aliases?: string;
  cve_id?: string;
  epss_score?: number | null;
  epss_percentile?: number | null;
  in_kev?: boolean;
  kev_date_added?: string;
  kev_due_date?: string;
  kev_required_action?: string;
  kev_ransomware?: string | null;
}

export interface DecisionReason {
  signal: string;
  detail: string;
  icon?: string;
}

export interface Decision {
  action: "fix_now" | "watch" | "ignore";
  reasons: DecisionReason[];
  confidence: "high" | "medium" | "low";
  urgency_rank: number;
}

export interface PolicyViolation {
  policy_id: string;
  policy_name: string;
  action: "block" | "warn";
  package: string;
  version: string;
  reason: string;
}

export interface ScanResult {
  scan_id: string;
  repo_url: string;
  repo_name: string;
  status: "pending" | "parsing" | "querying" | "scoring" | "summarizing" | "complete" | "error";
  scanned_at: string | null;
  total_deps: number;
  critical_count: number;
  warning_count: number;
  healthy_count: number;
  overall_score: number;
  fix_now_count?: number;
  watch_count?: number;
  ignore_count?: number;
  packages: PackageRisk[];
  coral_query: string | null;
  error_message: string | null;
  policy_violations: PolicyViolation[];
}

export interface ScanListItem {
  scan_id: string;
  repo_url: string;
  status: string;
  total_deps: number;
  created_at: string;
  scan_count?: number;
}

export interface GithubRepo {
  id: number;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
}

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

/** Start a new scan */
export async function startScan(repoUrl: string, force: boolean = false): Promise<{ scan_id: string }> {
  const res = await fetch(`${API_BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ repo_url: repoUrl, force }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start scan");
  }

  return res.json();
}

/** Get scan results */
export async function getScanResults(scanId: string): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/api/results/${scanId}`);

  if (!res.ok) {
    throw new Error("Scan not found");
  }

  return res.json();
}

/** Get the current authenticated user */
export async function getCurrentUser(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error("Not authenticated");
  }

  return res.json();
}

/** List scans for the authenticated user */
export async function listUserScans(): Promise<ScanListItem[]> {
  const res = await fetch(`${API_BASE}/api/user/scans`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error("Failed to load scans");
  }

  return res.json();
}

/** List GitHub repositories for the authenticated user */
export async function listGithubRepos(): Promise<GithubRepo[]> {
  const res = await fetch(`${API_BASE}/api/github/repos`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail || "Failed to load GitHub repos";
    if (res.status === 401) throw new Error(detail || "GitHub token revoked");
    throw new Error(detail);
  }

  return res.json();
}

/** Delete all scan history rows for a repository */
export async function deleteUserScans(repoUrl: string): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/api/user/scans?repo_url=${encodeURIComponent(repoUrl)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete scans");
  }

  return res.json();
}

/** Submit contact form */
export async function submitContact(payload: ContactPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to send message");
  }
}

/** Legacy alias for user scans */
export async function listScans(): Promise<ScanListItem[]> {
  return listUserScans();
}

/** Poll scan until complete */
export async function pollScan(
  scanId: string,
  onUpdate: (result: ScanResult) => void,
  intervalMs: number = 2000,
  maxAttempts: number = 60
): Promise<ScanResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getScanResults(scanId);
    onUpdate(result);

    if (result.status === "complete" || result.status === "error") {
      return result;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Scan timed out");
}
/** Create a GitHub issue for a vulnerability */
export async function createGitHubIssue(payload: {
  repo_url: string;
  package_name: string;
  scan_id: string;
  vuln_id?: string;
}): Promise<{ issue_url: string; issue_number: number }> {
  const res = await fetch(`${API_BASE}/api/github/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create GitHub issue");
  }

  return res.json();
}

/** Download CycloneDX SBOM for a scan */
export function exportSBOM(scanId: string): void {
  window.location.href = `${API_BASE}/api/export/sbom/${scanId}`;
}

/** Return the badge SVG URL for embedding in READMEs */
export function badgeUrl(scanId: string): string {
  return `${API_BASE}/api/badge/${scanId}`;
}
