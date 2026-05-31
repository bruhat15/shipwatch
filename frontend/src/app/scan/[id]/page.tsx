"use client";

import { useEffect, useState, useMemo, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getScanResults,
  createGitHubIssue,
  exportSBOM,
  badgeUrl,
  type ScanResult,
  type PackageRisk,
  type PolicyViolation,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

const statusMessages: Record<string, string> = {
  pending: "Initializing scan...",
  parsing: "Parsing dependencies...",
  querying: "Querying GitHub, OSV & npm via Coral...",
  scoring: "Calculating risk scores...",
  summarizing: "Generating AI insights...",
  complete: "Scan complete!",
  error: "Scan failed",
};

type SortKey = "risk" | "name" | "downloads" | "vulns" | "stars" | "decision";
type DecisionFilter = "all" | "fix_now" | "watch" | "ignore";

/* ─── Shared UI Components ───────────────────────────────────────────── */

function RiskBadge({ level }: { level: string }) {
  const config = {
    critical: { label: "Critical", bg: "bg-red-500/10", text: "text-red-400", ring: "ring-red-500/20", dot: "bg-red-500" },
    warning: { label: "Warning", bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20", dot: "bg-amber-500" },
    healthy: { label: "Healthy", bg: "bg-green-500/10", text: "text-green-400", ring: "ring-green-500/20", dot: "bg-green-500" },
  }[level] || { label: level, bg: "bg-neutral-500/10", text: "text-neutral-400", ring: "ring-neutral-500/20", dot: "bg-neutral-500" };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${config.bg} ${config.text} ${config.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function DecisionBadge({ action, isDev }: { action?: string; isDev?: boolean }) {
  if (!action) return null;
  const config = {
    fix_now: { label: "Fix Now", bg: "bg-red-500/10", text: "text-red-400", ring: "ring-red-500/20", dot: "bg-red-500" },
    watch: { label: "Watch", bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20", dot: "bg-amber-500" },
    ignore: { label: "Ignore", bg: "bg-slate-500/10", text: "text-slate-500", ring: "ring-slate-500/20", dot: "bg-slate-500" },
  }[action as "fix_now" | "watch" | "ignore"] || { label: action, bg: "bg-neutral-500/10", text: "text-neutral-400", ring: "ring-neutral-500/20", dot: "bg-neutral-500" };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${config.bg} ${config.text} ${config.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}{isDev ? " (dev)" : ""}
    </span>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-600 dark:text-neutral-400">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RiskDistributionBar({ critical, warning, healthy }: { critical: number; warning: number; healthy: number }) {
  const total = critical + warning + healthy;
  if (total === 0) return null;

  const cp = (critical / total) * 100;
  const wp = (warning / total) * 100;
  const hp = (healthy / total) * 100;

  return (
    <div className="mb-8 animate-slide-up">
      <div className="flex items-center justify-between mb-2 text-xs text-slate-500 dark:text-neutral-500">
        <span>Risk Distribution</span>
        <span>{total} packages</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-slate-200 dark:bg-neutral-800">
        {critical > 0 && (
          <div className="bg-red-500 transition-all duration-700 relative" style={{ width: `${Math.max(cp, 2)}%` }}>
            <div className="absolute inset-0 bg-red-400/30 animate-pulse" />
          </div>
        )}
        {warning > 0 && (
          <div className="bg-amber-500 transition-all duration-700 relative" style={{ width: `${Math.max(wp, 2)}%` }} />
        )}
        {healthy > 0 && (
          <div className="bg-green-500/80 transition-all duration-700 relative" style={{ width: `${Math.max(hp, 2)}%` }} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /> {critical} critical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> {warning} warning
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> {healthy} healthy
        </span>
      </div>
    </div>
  );
}

function useTransientFlag(duration: number = 1500) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const trigger = useCallback((key: string) => {
    setActiveKey(key);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setActiveKey(null), duration);
  }, [duration]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  return { activeKey, trigger };
}

function ScanningState({ status, totalDeps, streamedPkgs }: { status: string; totalDeps?: number; streamedPkgs?: {name: string; risk_level: string; risk_score: number}[] }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-grid-soft dark:bg-grid">
      <div className="text-center max-w-md w-full px-4">
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-2 border-teal-500/30 animate-pulse-ring" />
          <div className="absolute inset-2 rounded-full border-2 border-teal-500/20 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-teal-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        </div>
        <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">{statusMessages[status] || "Processing..."}</h2>
        <p className="text-sm text-slate-500 dark:text-neutral-500">
          {totalDeps ? `Analyzing ${totalDeps} dependencies...` : "This usually takes 15-30 seconds"}
        </p>

        <div className="mt-8 flex justify-center gap-2">
          {["parsing", "querying", "scoring", "summarizing"].map((step, i) => {
            const steps = ["parsing", "querying", "scoring", "summarizing"];
            const currentIdx = steps.indexOf(status);
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <div key={step} className="flex flex-col items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isDone ? "bg-teal-500" : isActive ? "bg-teal-500 animate-pulse scale-125" : "bg-slate-300 dark:bg-neutral-700"}`} />
                <span className={`text-[10px] ${isDone ? "text-teal-500" : isActive ? "text-teal-500" : "text-slate-500 dark:text-neutral-600"}`}>
                  {step.charAt(0).toUpperCase() + step.slice(1)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live feed of streamed packages */}
        {streamedPkgs && streamedPkgs.length > 0 && (
          <div className="mt-6 glass-card p-3 text-left max-h-48 overflow-y-auto">
            <p className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase tracking-wide mb-2">Live feed</p>
            <div className="space-y-1">
              {streamedPkgs.slice(-8).map((pkg, i) => (
                <div key={i} className="flex items-center justify-between text-xs animate-slide-up">
                  <span className="text-slate-700 dark:text-neutral-300 truncate">{pkg.name}</span>
                  <span className={`text-[10px] font-medium ${
                    pkg.risk_level === "critical" ? "text-red-400" :
                    pkg.risk_level === "warning" ? "text-amber-400" :
                    "text-green-400"
                  }`}>
                    {pkg.risk_score}/10
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Export Helpers ──────────────────────────────────────────────────── */

function generateMarkdownReport(result: ScanResult): string {
  const lines: string[] = [
    `# ShipWatch Dependency Audit Report`,
    ``,
    `**Repository**: [${result.repo_name}](${result.repo_url})`,
    `**Scanned**: ${result.scanned_at ? new Date(result.scanned_at).toLocaleString() : "N/A"}`,
    `**Total Dependencies**: ${result.total_deps}`,
    ``,
    `## Summary`,
    `- 🔴 Critical: ${result.critical_count}`,
    `- 🟡 Warning: ${result.warning_count}`,
    `- 🟢 Healthy: ${result.healthy_count}`,
    ``,
  ];

  const sections = [
    { level: "critical", title: "Critical Packages", emoji: "🔴" },
    { level: "warning", title: "Warning Packages", emoji: "🟡" },
  ];

  for (const sec of sections) {
    const pkgs = result.packages.filter((p) => p.risk_level === sec.level);
    if (pkgs.length === 0) continue;

    lines.push(`## ${sec.emoji} ${sec.title}`, ``);

    for (const pkg of pkgs) {
      lines.push(`### ${pkg.name} (v${pkg.version})`);
      lines.push(`- **Risk Score**: ${pkg.risk_score}/10 (${pkg.confidence} confidence)`);
      lines.push(`- **Risk Level**: ${pkg.risk_level.toUpperCase()}`);
      if (pkg.decision?.action) {
        lines.push(`- **Decision**: ${pkg.decision.action.replace("_", " ").toUpperCase()} (${pkg.decision.confidence} confidence)`);
        if (pkg.decision.reasons && pkg.decision.reasons.length > 0) {
          lines.push(`- **Decision Signals**:`);
          for (const reason of pkg.decision.reasons.slice(0, 3)) {
            lines.push(`  - ${reason.icon ? reason.icon + " " : ""}${reason.detail}`);
          }
        }
      }
      if (pkg.vuln_count > 0) {
        lines.push(`- **Vulnerabilities**: ${pkg.vuln_count}`);
        for (const v of pkg.vulnerabilities.slice(0, 3)) {
          lines.push(`  - [${v.severity}] ${v.id}: ${v.summary}`);
        }
      }
      if (pkg.fixes && pkg.fixes.length > 0) {
        lines.push(`- **Fixes**:`);
        for (const fix of pkg.fixes) {
          lines.push(`  - [${fix.urgency.toUpperCase()}] ${fix.description}`);
          if (fix.command) lines.push(`    \`${fix.command}\``);
        }
      }
      if (pkg.stars !== null) lines.push(`- **Stars**: ${pkg.stars?.toLocaleString()}`);
      if (pkg.last_commit) lines.push(`- **Last Commit**: ${new Date(pkg.last_commit).toLocaleDateString()}`);
      if (pkg.weekly_downloads !== null) lines.push(`- **Downloads**: ${pkg.weekly_downloads?.toLocaleString()}/month`);
      if (pkg.license) lines.push(`- **License**: ${pkg.license}`);
      if (pkg.ai_summary) lines.push(`- **AI Analysis**: ${pkg.ai_summary}`);
      if (pkg.ai_recommendation) lines.push(`- **Recommendation**: ${pkg.ai_recommendation}`);
      if (pkg.license_issues && pkg.license_issues.length > 0) {
        for (const issue of pkg.license_issues) {
          lines.push(`- **⚖️ License ${issue.type}**: ${issue.message}`);
        }
      }
      lines.push(``);
    }
  }

  if (result.coral_query) {
    lines.push(`## Coral SQL Query`, ``, "```sql", result.coral_query, "```", ``);
  }

  lines.push(`---`, `*Generated by [ShipWatch](https://github.com/shipwatch) — powered by Coral*`);
  return lines.join("\n");
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Main Page Component ────────────────────────────────────────────── */

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<PackageRisk | null>(null);
  const [showQuery, setShowQuery] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("risk");
  const [issueStatus, setIssueStatus] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
  const [issueLinks, setIssueLinks] = useState<Record<string, string>>({});
  const [checkedFixes, setCheckedFixes] = useState<Record<string, boolean>>({});
  const [expandedVulns, setExpandedVulns] = useState<Record<string, boolean>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [remediationOpen, setRemediationOpen] = useState(true);
  const [showAllFixes, setShowAllFixes] = useState(false);
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const exportRef = useRef<HTMLDivElement | null>(null);
  const { activeKey: copyKey, trigger: triggerCopyFeedback } = useTransientFlag(1500);
  const { activeKey: exportKey, trigger: triggerExportFeedback } = useTransientFlag(1500);
  const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950";

  // Load checklist from localStorage on mount
  useEffect(() => {
    if (id) {
      try {
        const saved = localStorage.getItem(`shipwatch-checklist-${id}`);
        if (saved) setCheckedFixes(JSON.parse(saved));
      } catch {}
    }
  }, [id]);

  const toggleFix = useCallback((fixKey: string) => {
    setCheckedFixes(prev => {
      const next = { ...prev, [fixKey]: !prev[fixKey] };
      try { localStorage.setItem(`shipwatch-checklist-${id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [id]);

  const handleCreateIssue = useCallback(async (pkg: PackageRisk, scanResult: ScanResult) => {
    const key = pkg.name;
    setIssueStatus(prev => ({ ...prev, [key]: "loading" }));
    try {
      const vuln = pkg.vulnerabilities?.[0];
      const resp = await createGitHubIssue({
        repo_url: scanResult.repo_url,
        package_name: pkg.name,
        scan_id: scanResult.scan_id,
        vuln_id: vuln?.id,
      });
      setIssueLinks(prev => ({ ...prev, [key]: resp.issue_url }));
      setIssueStatus(prev => ({ ...prev, [key]: "done" }));
    } catch (e: unknown) {
      setIssueStatus(prev => ({ ...prev, [key]: "error" }));
      alert(e instanceof Error ? e.message : "Failed to create issue");
    }
  }, []);

  const handleCopy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      triggerCopyFeedback(key);
    });
  }, [triggerCopyFeedback]);

  const toggleVulns = useCallback((pkgName: string) => {
    setExpandedVulns((prev) => ({ ...prev, [pkgName]: !prev[pkgName] }));
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!exportRef.current) return;
      if (!exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    if (exportOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportOpen]);

  const { theme, toggleTheme, isReady } = useTheme();

  // SSE streaming state
  const [streamedPkgs, setStreamedPkgs] = useState<{name: string; risk_level: string; risk_score: number}[]>([]);

  useEffect(() => {
    let mounted = true;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    // Try SSE first
    const es = new EventSource(`${API_BASE}/api/scan/${id}/stream`);
    let sseWorking = false;

    es.addEventListener("status", (e) => {
      if (!mounted) return;
      sseWorking = true;
      const data = JSON.parse(e.data);
      setResult(prev => prev ? { ...prev, status: data.status, total_deps: data.total_deps } : {
        scan_id: id, repo_url: "", repo_name: "", status: data.status,
        scanned_at: null, total_deps: data.total_deps, critical_count: 0,
        warning_count: 0, healthy_count: 0, overall_score: 0, packages: [], coral_query: null,
        error_message: null, policy_violations: [],
      } as ScanResult);
    });

    es.addEventListener("package", (e) => {
      if (!mounted) return;
      const pkg = JSON.parse(e.data);
      setStreamedPkgs(prev => [...prev, pkg]);
    });

    es.addEventListener("done", async () => {
      if (!mounted) return;
      es.close();
      // Fetch full results
      try {
        const data = await getScanResults(id);
        if (mounted) setResult(data);
      } catch {}
    });

    es.addEventListener("error", async (e) => {
      es.close();
      if (!mounted) return;

      // Fallback to polling
      const poll = async () => {
        try {
          const data = await getScanResults(id);
          if (!mounted) return;
          setResult(data);
          if (data.status === "complete" || data.status === "error") {
            clearInterval(interval);
          }
        } catch {
          if (mounted) setError("Failed to load scan results");
          clearInterval(interval);
        }
      };
      poll();
      const interval = setInterval(poll, 2000);
      return () => clearInterval(interval);
    });

    return () => { mounted = false; es.close(); };
  }, [id]);

  // Filtered + sorted packages
  const filteredPackages = useMemo(() => {
    if (!result) return [];

    let pkgs = result.packages
      .filter((p) => filter === "all" || p.risk_level === filter)
      .filter((p) => decisionFilter === "all" || p.decision?.action === decisionFilter)
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

    const levelOrder: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
    const decisionOrder: Record<string, number> = { fix_now: 0, watch: 1, ignore: 2 };

    switch (sortBy) {
      case "name":
        pkgs.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "downloads":
        pkgs.sort((a, b) => (b.weekly_downloads ?? 0) - (a.weekly_downloads ?? 0));
        break;
      case "vulns":
        pkgs.sort((a, b) => b.vuln_count - a.vuln_count);
        break;
      case "stars":
        pkgs.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
        break;
      case "decision":
        pkgs.sort(
          (a, b) => (decisionOrder[a.decision?.action ?? "ignore"] ?? 3) - (decisionOrder[b.decision?.action ?? "ignore"] ?? 3)
            || b.risk_score - a.risk_score
        );
        break;
      case "risk":
      default:
        pkgs.sort((a, b) => (levelOrder[a.risk_level] ?? 3) - (levelOrder[b.risk_level] ?? 3) || b.risk_score - a.risk_score);
    }

    return pkgs;
  }, [result, filter, decisionFilter, search, sortBy]);

  const decisionSummary = useMemo(() => {
    if (!result) return { fix_now: 0, watch: 0, ignore: 0 };
    return result.packages.reduce((acc, pkg) => {
      const action = pkg.decision?.action || "ignore";
      if (action === "fix_now") acc.fix_now += 1;
      else if (action === "watch") acc.watch += 1;
      else acc.ignore += 1;
      return acc;
    }, { fix_now: 0, watch: 0, ignore: 0 });
  }, [result]);

  /* ── Render states ─────────────────────── */

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-grid-soft dark:bg-grid">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => router.push("/")} className="text-teal-600 hover:underline dark:text-cyan-400">← Back to home</button>
        </div>
      </div>
    );
  }

  if (!result || (result.status !== "complete" && result.status !== "error")) {
    return <ScanningState status={result?.status || "pending"} totalDeps={result?.total_deps} streamedPkgs={streamedPkgs} />;
  }

  if (result.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-grid-soft dark:bg-grid">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">Scan Failed</h2>
          <p className="text-slate-600 dark:text-neutral-400 mb-4">{result.error_message}</p>
          <button onClick={() => router.push("/dashboard")} className="text-teal-600 hover:underline dark:text-cyan-400">← Try another repo</button>
        </div>
      </div>
    );
  }

  const overallScore = Number.isFinite(result.overall_score) ? result.overall_score : 0;

  /* ── Main dashboard ─────────────────────── */

  return (
    <div className="min-h-screen bg-grid-soft dark:bg-grid">
      {/* Top bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-slate-200/80 dark:bg-neutral-950/80 dark:border-neutral-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push(isLoggedIn ? "/dashboard" : "/")}
            className={`flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors dark:text-neutral-400 dark:hover:text-neutral-200 ${focusRing}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline">New scan</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm text-slate-500 hidden sm:inline dark:text-neutral-500">{result.repo_name}</span>

            {/* Export dropdown */}
            <div
              ref={exportRef}
              className="relative"
              onMouseEnter={() => setExportOpen(true)}
              onMouseLeave={() => setExportOpen(false)}
            >
              <button
                onClick={() => setExportOpen((open) => !open)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-all flex items-center gap-1.5 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 ${focusRing}`}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export
              </button>
              <div
                className={`absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-xl transition-all z-50 dark:bg-neutral-900 dark:border-neutral-700 ${exportOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
                role="menu"
              >
                <button
                  onClick={() => {
                    downloadFile(generateMarkdownReport(result), `shipwatch-${result.repo_name}.md`, "text/markdown");
                    triggerExportFeedback("export-md");
                    setExportOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-t-lg transition-colors dark:text-neutral-300 dark:hover:bg-neutral-800 ${focusRing}`}
                  role="menuitem"
                >
                  📄 Markdown Report {exportKey === "export-md" && <span className="text-green-500">✓</span>}
                </button>
                <button
                  onClick={() => {
                    downloadFile(JSON.stringify(result, null, 2), `shipwatch-${result.repo_name}.json`, "application/json");
                    triggerExportFeedback("export-json");
                    setExportOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition-colors dark:text-neutral-300 dark:hover:bg-neutral-800 ${focusRing}`}
                  role="menuitem"
                >
                  📋 JSON Data {exportKey === "export-json" && <span className="text-green-500">✓</span>}
                </button>
                <button
                  onClick={() => {
                    handleCopy("badge", `![ShipWatch Score](${badgeUrl(result.scan_id)})`);
                    setExportOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition-colors dark:text-neutral-300 dark:hover:bg-neutral-800 ${focusRing}`}
                  role="menuitem"
                >
                  🏷️ README Badge (Markdown) {copyKey === "badge" && <span className="text-green-500">Copied</span>}
                </button>
                <button
                  onClick={() => {
                    exportSBOM(result.scan_id);
                    setExportOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-b-lg transition-colors dark:text-neutral-300 dark:hover:bg-neutral-800 ${focusRing}`}
                  role="menuitem"
                >
                  📦 Export SBOM (CycloneDX)
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowQuery(!showQuery)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-all dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-1 dark:ring-cyan-500/20 dark:hover:bg-cyan-500/20 ${focusRing}`}
            >
              {showQuery ? "Hide" : "Show"} Coral Query
            </button>
            <button
              onClick={toggleTheme}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100 ${focusRing}`}
            >
              {isReady && theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              <span className="text-slate-500 dark:text-neutral-400">Scan:</span>{" "}
              <a
                href={result.repo_url}
                target="_blank"
                rel="noopener"
                className="text-slate-900 hover:text-teal-600 transition-colors dark:text-neutral-100 dark:hover:text-cyan-400"
              >
                {result.repo_name}
              </a>
            </h1>
            <p className="text-sm text-slate-600 dark:text-neutral-500">
              {result.total_deps} dependencies analyzed · Scanned {result.scanned_at ? new Date(result.scanned_at).toLocaleString() : "just now"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-neutral-500">
              <span className="inline-flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={badgeUrl(result.scan_id)} alt="ShipWatch score badge" className="h-5" />
                <button
                  onClick={() => handleCopy("badge-inline", `![ShipWatch Score](${badgeUrl(result.scan_id)})`)}
                  className={`text-xs text-slate-500 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-200 transition-colors ${focusRing}`}
                >
                  {copyKey === "badge-inline" ? "Copied!" : "Copy README badge"}
                </button>
              </span>
              <button
                onClick={() => handleCopy("share-link", window.location.href)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/5 text-slate-600 hover:text-slate-900 hover:bg-slate-900/10 transition-colors dark:bg-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100 ${focusRing}`}
                aria-label="Share this report"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 8.25L19.5 12m0 0l-3.75 3.75M19.5 12H4.5" />
                </svg>
                {copyKey === "share-link" ? "Link copied!" : "Share report"}
              </button>
            </div>
          </div>
          <div className="glass-card px-5 py-4 sm:min-w-[180px]">
            <p className="text-xs text-slate-500 dark:text-neutral-500 mb-2">Overall Score</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-neutral-100">
                {Math.round(overallScore * 10) / 10}
              </span>
              <span className="text-sm text-slate-500 dark:text-neutral-500">/10</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-500"
                style={{ width: `${Math.min((overallScore / 10) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Coral Query Panel */}
        {showQuery && result.coral_query && (
          <div className="mb-8 glass-card p-4 sm:p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-2 text-xs text-slate-500 dark:text-neutral-500 font-mono">coral sql — the query that powered this scan</span>
            </div>
            <pre className="code-block text-slate-700 dark:text-neutral-300 overflow-x-auto whitespace-pre">
              <code>{result.coral_query}</code>
            </pre>
          </div>
        )}

        {/* Risk Distribution Bar */}
        <RiskDistributionBar critical={result.critical_count} warning={result.warning_count} healthy={result.healthy_count} />

        {/* Decision Summary */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Fix Now" value={decisionSummary.fix_now} color="text-red-400"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>} />
          <StatCard label="Watch" value={decisionSummary.watch} color="text-amber-400"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" /></svg>} />
          <StatCard label="Ignore" value={decisionSummary.ignore} color="text-slate-500"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75" /></svg>} />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Total" value={result.total_deps} color="text-slate-900 dark:text-neutral-100"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>} />
          <StatCard label="Critical" value={result.critical_count} color="text-red-400"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>} />
          <StatCard label="Warning" value={result.warning_count} color="text-amber-400"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>} />
          <StatCard label="Healthy" value={result.healthy_count} color="text-green-400"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
          <StatCard label="Score" value={Math.round(overallScore * 10) / 10} color="text-cyan-400"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        </div>

        {/* Policy Violations Panel */}
        {result.policy_violations && result.policy_violations.length > 0 && (() => {
          const blocks = result.policy_violations.filter(v => v.action === "block");
          const warns = result.policy_violations.filter(v => v.action === "warn");
          return (
            <div className="mb-6 glass-card p-4 border-l-4 border-red-500 animate-slide-up">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                  Policy Gate: {blocks.length} block{blocks.length !== 1 ? "s" : ""}, {warns.length} warning{warns.length !== 1 ? "s" : ""}
                </span>
                </div>
                <button
                  onClick={() => setPolicyOpen((open) => !open)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100/60 transition-colors dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100 dark:hover:bg-neutral-800/70 ${focusRing}`}
                >
                  {policyOpen ? "Hide" : "Show"}
                </button>
              </div>
              <div className={`space-y-1.5 overflow-hidden transition-all duration-300 ${policyOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
                {result.policy_violations.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded font-bold uppercase ${
                      v.action === "block"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {v.action}
                    </span>
                    <span className="font-mono text-slate-700 dark:text-neutral-300 font-medium">{v.package}@{v.version}</span>
                    <span className="text-slate-500 dark:text-neutral-500">— {v.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Remediation Checklist */}
        {(() => {
          const allFixes = result.packages
            .flatMap(pkg => (pkg.fixes || []).map((f, fi) => ({ ...f, pkgName: pkg.name, key: `${pkg.name}-${fi}` })))
            .sort((a, b) => {
              const order: Record<string, number> = { now: 0, soon: 1, later: 2 };
              return (order[a.urgency] ?? 2) - (order[b.urgency] ?? 2);
            });
          if (allFixes.length === 0) return null;
          const checkedCount = allFixes.filter(f => checkedFixes[f.key]).length;
          const pct = Math.round((checkedCount / allFixes.length) * 100);
          const visibleFixes = remediationOpen ? (showAllFixes ? allFixes : allFixes.slice(0, 5)) : [];
          return (
            <div className="mb-6 glass-card p-4 sm:p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-teal-500 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Remediation Plan</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-neutral-500">
                    {checkedCount}/{allFixes.length} resolved · {pct}%
                  </span>
                  <button
                    onClick={() => setRemediationOpen((open) => !open)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100/60 transition-colors dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100 dark:hover:bg-neutral-800/70 ${focusRing}`}
                  >
                    {remediationOpen ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-neutral-800 mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={`overflow-hidden transition-all duration-300 ${remediationOpen ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleFixes.map((fix) => (
                    <label key={fix.key} className="flex items-start gap-2.5 rounded-lg border border-slate-200/70 bg-white/50 p-3 cursor-pointer group dark:border-neutral-800 dark:bg-neutral-900/40">
                      <input
                        type="checkbox"
                        checked={!!checkedFixes[fix.key]}
                        onChange={() => toggleFix(fix.key)}
                        className="mt-0.5 w-3.5 h-3.5 rounded accent-teal-500 dark:accent-cyan-500 flex-shrink-0"
                      />
                      <div className={checkedFixes[fix.key] ? "opacity-40 line-through" : ""}>
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-bold mr-1.5 ${
                          fix.urgency === "now" ? "bg-red-500/10 text-red-400" :
                          fix.urgency === "soon" ? "bg-amber-500/10 text-amber-400" :
                          "bg-slate-200/60 text-slate-500 dark:bg-neutral-700/60 dark:text-neutral-400"
                        }`}>{fix.urgency.toUpperCase()}</span>
                        <span className="text-xs font-medium text-slate-700 dark:text-neutral-300">{fix.pkgName}</span>
                        <span className="text-xs text-slate-500 dark:text-neutral-500 ml-1">— {fix.title}</span>
                        {fix.command && (
                          <code className="mt-2 block text-[11px] text-teal-600 dark:text-cyan-400 font-mono bg-slate-100 dark:bg-neutral-800/70 rounded px-2 py-1">
                            {fix.command}
                          </code>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {remediationOpen && allFixes.length > 5 && (
                <button
                  onClick={() => setShowAllFixes((show) => !show)}
                  className={`mt-3 px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100/60 transition-colors dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100 dark:hover:bg-neutral-800/70 ${focusRing}`}
                >
                  {showAllFixes ? "Show less" : `Show all (${allFixes.length})`}
                </button>
              )}
            </div>
          );
        })()}

        {/* Controls: Filter tabs + Search + Sort */}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          {/* Filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: "all", label: "All", count: result.total_deps },
              { key: "critical", label: "Critical", count: result.critical_count },
              { key: "warning", label: "Warning", count: result.warning_count },
              { key: "healthy", label: "Healthy", count: result.healthy_count },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${focusRing} ${
                  filter === tab.key
                    ? "bg-slate-900 text-white dark:bg-neutral-800 dark:text-neutral-100"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800/50"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Decision filter */}
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: "all", label: "All" },
              { key: "fix_now", label: "Fix Now" },
              { key: "watch", label: "Watch" },
              { key: "ignore", label: "Ignore" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setDecisionFilter(tab.key as DecisionFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${focusRing} ${
                  decisionFilter === tab.key
                    ? "bg-slate-900 text-white dark:bg-neutral-800 dark:text-neutral-100"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 sm:ml-auto">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                id="package-search"
                type="text"
                placeholder="Search packages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full sm:w-48 pl-8 pr-3 py-1.5 rounded-lg bg-white/80 border border-slate-200 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-1 focus:ring-teal-500/30 transition-all dark:bg-neutral-800/50 dark:border-neutral-700/50 dark:text-neutral-200 dark:placeholder-neutral-500 dark:focus:ring-cyan-500/30 ${focusRing}`}
              />
            </div>

            {/* Sort */}
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className={`px-3 py-1.5 rounded-lg bg-white/80 border border-slate-200 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-teal-500/30 cursor-pointer dark:bg-neutral-800/50 dark:border-neutral-700/50 dark:text-neutral-300 dark:focus:ring-cyan-500/30 ${focusRing}`}
            >
              <option value="risk">Sort: Risk</option>
              <option value="decision">Sort: Decision</option>
              <option value="name">Sort: Name</option>
              <option value="vulns">Sort: Vulns</option>
              <option value="downloads">Sort: Downloads</option>
              <option value="stars">Sort: Stars</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        {search && (
          <p className="text-xs text-slate-500 dark:text-neutral-500 mb-3">
            Showing {filteredPackages.length} of {result.total_deps} packages
          </p>
        )}

        {/* Package list */}
        <div className="space-y-2">
          {filteredPackages.length === 0 && (
            <div className="text-center py-12 text-slate-500 dark:text-neutral-500 text-sm">
              No packages match your filters.
            </div>
          )}
          {filteredPackages.map((pkg, i) => {
            const isSelected = selectedPkg?.name === pkg.name;
            const toggleSelected = () => setSelectedPkg(isSelected ? null : pkg);

            return (
              <div
                key={pkg.name}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={toggleSelected}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSelected();
                  }
                }}
                className={`w-full text-left glass-card p-3 sm:p-4 hover:border-slate-300 dark:hover:border-neutral-700 transition-all animate-slide-up cursor-pointer ${focusRing} ${
                  isSelected ? "ring-1 ring-cyan-500/30" : ""
                }`}
                style={{ animationDelay: `${Math.min(i * 0.02, 0.4)}s` }}
              >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <RiskBadge level={pkg.risk_level} />
                  <DecisionBadge action={pkg.decision?.action} isDev={pkg.dep_type === "dev"} />
                  <span className="font-medium text-slate-900 dark:text-neutral-100 truncate text-sm">{pkg.name}</span>
                  <span className="text-xs text-slate-500 dark:text-neutral-600 font-mono hidden sm:inline">{pkg.version}</span>
                </div>
                <div className="flex items-center gap-3 sm:gap-6 text-xs text-slate-500 dark:text-neutral-500 flex-shrink-0">
                  {pkg.vuln_count > 0 && (
                    <span className="text-red-400 font-medium">{pkg.vuln_count} CVE{pkg.vuln_count !== 1 ? "s" : ""}</span>
                  )}
                  <span className="text-slate-700 dark:text-neutral-300 font-medium sm:hidden">{pkg.risk_score}/10</span>
                  {pkg.stars !== null && pkg.stars > 0 && (
                    <span className="flex items-center gap-1 hidden sm:flex">★ {pkg.stars?.toLocaleString()}</span>
                  )}
                  {pkg.weekly_downloads !== null && (
                    <span className="hidden md:inline">↓ {(pkg.weekly_downloads! / 1000).toFixed(0)}K/mo</span>
                  )}
                  <svg className={`w-4 h-4 transition-transform ${isSelected ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {/* Expanded detail */}
              <div
                className={`mt-4 pt-4 border-t border-slate-200 dark:border-neutral-800 transition-all duration-300 ease-out overflow-hidden ${isSelected ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"}`}
                onClick={(e) => e.stopPropagation()}
                aria-hidden={!isSelected}
              >
                  {/* Risk score mini bar (0-10 scale) */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500 dark:text-neutral-500">Risk Score</span>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          pkg.confidence === 'high' ? 'bg-green-500/10 text-green-400' :
                          pkg.confidence === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-neutral-500/10 text-neutral-400'
                        }`}>
                          {pkg.confidence} confidence
                        </span>
                        <span className={pkg.risk_level === "critical" ? "text-red-400 font-bold" : pkg.risk_level === "warning" ? "text-amber-400 font-bold" : "text-green-400 font-bold"}>
                          {pkg.risk_score}/10
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pkg.risk_level === "critical" ? "bg-red-500" : pkg.risk_level === "warning" ? "bg-amber-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min((pkg.risk_score / 10) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-neutral-800">
                    <div>
                      <h4 className="text-xs text-slate-500 dark:text-neutral-500 uppercase tracking-wide mb-2">Security</h4>
                      {pkg.vulnerabilities.length > 0 ? (
                        <div className="space-y-2">
                          {(expandedVulns[pkg.name] ? pkg.vulnerabilities : pkg.vulnerabilities.slice(0, 3)).map((v) => (
                            <div key={v.id} className="text-xs">
                              <span className={`font-medium ${v.severity === "CRITICAL" ? "text-red-400" : v.severity === "HIGH" ? "text-amber-400" : "text-yellow-400"}`}>
                                [{v.severity}]
                              </span>{" "}
                              <span className="text-slate-700 dark:text-neutral-300">{v.id}</span>
                              <p className="text-slate-600 dark:text-neutral-500 mt-0.5 line-clamp-2">{v.summary}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-neutral-500">
                                <span>EPSS: {v.epss_score !== undefined && v.epss_score !== null ? `${Math.round(v.epss_score * 1000) / 10}%` : "—"}</span>
                                <span>·</span>
                                <span>KEV: {v.in_kev ? "Yes" : "No"}</span>
                              </div>
                            </div>
                          ))}
                          {pkg.vulnerabilities.length > 3 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleVulns(pkg.name); }}
                              className={`inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-200 transition-colors ${focusRing}`}
                            >
                              {expandedVulns[pkg.name] ? "Show fewer" : `+${pkg.vulnerabilities.length - 3} more`}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-green-400">✓ No known vulnerabilities</p>
                      )}
                    </div>
                    <div className="sm:px-4">
                      <h4 className="text-xs text-slate-500 dark:text-neutral-500 uppercase tracking-wide mb-2">Maintenance</h4>
                      <div className="space-y-1.5 text-xs">
                        <p><span className="text-slate-500 dark:text-neutral-500">Last commit:</span> <span className="text-slate-700 dark:text-neutral-300">{pkg.last_commit ? new Date(pkg.last_commit).toLocaleDateString() : "—"}</span></p>
                        <p><span className="text-slate-500 dark:text-neutral-500">Open issues:</span> <span className="text-slate-700 dark:text-neutral-300">{pkg.open_issues?.toLocaleString() ?? "—"}</span></p>
                        <p><span className="text-slate-500 dark:text-neutral-500">Stars:</span> <span className="text-slate-700 dark:text-neutral-300">{pkg.stars?.toLocaleString() ?? "—"}</span></p>
                        <p><span className="text-slate-500 dark:text-neutral-500">License:</span> <span className="text-slate-700 dark:text-neutral-300">{pkg.license ?? "—"}</span></p>
                      </div>
                    </div>
                    <div className="sm:px-4">
                      <h4 className="text-xs text-slate-500 dark:text-neutral-500 uppercase tracking-wide mb-2">Ecosystem</h4>
                      <div className="space-y-1.5 text-xs">
                        <p><span className="text-slate-500 dark:text-neutral-500">Downloads:</span> <span className="text-slate-700 dark:text-neutral-300">{pkg.weekly_downloads?.toLocaleString() ?? "—"}/month</span></p>
                        <p><span className="text-slate-500 dark:text-neutral-500">Maintainers:</span> <span className="text-slate-700 dark:text-neutral-300">{pkg.maintainers_count ?? "—"}</span></p>
                        <p><span className="text-slate-500 dark:text-neutral-500">Deprecated:</span> <span className={pkg.deprecated ? "text-red-400 font-medium" : "text-green-400"}>{pkg.deprecated ? "Yes ⚠️" : "No"}</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Decision Intelligence */}
                  {pkg.decision && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-900/5 border border-slate-200 dark:bg-neutral-900/40 dark:border-neutral-800">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                          </svg>
                          <span className="text-xs font-medium text-slate-700 dark:text-neutral-300">Decision Intelligence</span>
                        </div>
                        <DecisionBadge action={pkg.decision.action} isDev={pkg.dep_type === "dev"} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-neutral-500 mb-2">
                        <span>Confidence: {pkg.decision.confidence}</span>
                        <span>·</span>
                        <span>EPSS max: {pkg.epss_max_score !== null && pkg.epss_max_score !== undefined ? `${Math.round(pkg.epss_max_score * 1000) / 10}%` : "—"}</span>
                        <span>·</span>
                        <span>KEV: {pkg.in_kev ? "Yes" : "No"}</span>
                      </div>
                      <div className="space-y-1">
                        {pkg.decision.reasons?.slice(0, 6).map((reason, idx) => (
                          <div key={idx} className="text-xs text-slate-600 dark:text-neutral-400">
                            <span className="mr-1">{reason.icon || "•"}</span>
                            {reason.detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* License Issues */}
                  {pkg.license_issues && pkg.license_issues.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                        </svg>
                        <span className="text-xs font-medium text-amber-400">License Alert</span>
                      </div>
                      {pkg.license_issues.map((issue, idx) => (
                        <div key={idx} className="flex items-start gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            issue.severity === "critical" ? "bg-red-500/10 text-red-400" :
                            issue.severity === "warning" ? "bg-amber-500/10 text-amber-400" :
                            "bg-blue-500/10 text-blue-400"
                          }`}>
                            {issue.type.toUpperCase()}
                          </span>
                          <p className="text-xs text-slate-700 dark:text-neutral-300 leading-relaxed">{issue.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actionable Fixes */}
                  {pkg.fixes && pkg.fixes.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                      <div className="flex items-center gap-1.5 mb-2">
                        <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.684-5.684a8.122 8.122 0 01-1.424-1.883c-.146-.31-.166-.673-.046-.998.228-.61 1.007-.99 1.664-.99H7.5M8.25 18.75h7.5M12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.758V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.758c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
                        </svg>
                        <span className="text-xs font-medium text-cyan-400">Fixes ({pkg.fixes.length})</span>
                      </div>
                      <div className="space-y-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {pkg.fixes.map((fix, idx) => (
                            <div key={idx} className="rounded-lg border border-cyan-500/20 bg-white/60 p-3 dark:border-cyan-500/20 dark:bg-neutral-900/40">
                              <div className="flex items-start gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                                  fix.urgency === 'now' ? 'bg-red-500/10 text-red-400' :
                                  fix.urgency === 'soon' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-neutral-500/10 text-neutral-400'
                                }`}>
                                  {fix.urgency.toUpperCase()}
                                </span>
                                <p className="text-xs text-slate-700 dark:text-neutral-300">{fix.description}</p>
                              </div>
                              {fix.command && (
                                <button
                                  onClick={() => handleCopy(`fix-${pkg.name}-${idx}`, fix.command!)}
                                  className={`mt-2 flex w-full items-center justify-between gap-2 px-2 py-1 rounded bg-slate-900/10 border border-slate-300 text-[11px] font-mono text-slate-700 hover:bg-slate-900/20 transition-colors group dark:bg-neutral-800 dark:border-neutral-700/50 dark:text-cyan-400 dark:hover:bg-neutral-700 ${focusRing}`}
                                  aria-label={`Copy fix command for ${pkg.name}`}
                                >
                                  <span className="truncate">
                                    {copyKey === `fix-${pkg.name}-${idx}` ? "Copied!" : fix.command}
                                  </span>
                                  <svg className="w-3 h-3 flex-shrink-0 text-slate-500 group-hover:text-slate-900 transition-colors dark:text-neutral-500 dark:group-hover:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Summary */}
                  {pkg.ai_summary && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-100/70 border border-slate-200 dark:bg-neutral-800/50 dark:border-neutral-700/50">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        <span className="text-xs font-medium text-purple-400">AI Analysis</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-neutral-300 leading-relaxed">{pkg.ai_summary}</p>
                      {pkg.ai_recommendation && (
                        <p className="text-xs text-teal-600 dark:text-cyan-400 mt-2">💡 {pkg.ai_recommendation}</p>
                      )}
                    </div>
                  )}

                  {/* Create GitHub Issue Button */}
                  {(pkg.risk_level === "critical" || pkg.vuln_count > 0) && (
                    <div className="mt-3 flex items-center gap-2">
                      {issueStatus[pkg.name] === "done" ? (
                        <a
                          href={issueLinks[pkg.name]}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:underline"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Issue created ↗
                        </a>
                      ) : (
                        <button
                          disabled={issueStatus[pkg.name] === "loading"}
                          onClick={(e) => { e.stopPropagation(); handleCreateIssue(pkg, result); }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-all dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 ${focusRing}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                          </svg>
                          {issueStatus[pkg.name] === "loading" ? "Creating..." : "Create GitHub Issue"}
                        </button>
                      )}
                      {issueStatus[pkg.name] === "error" && (
                        <span className="text-xs text-red-400">Failed — see console</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
