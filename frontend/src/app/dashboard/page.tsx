"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { deleteUserScans, listGithubRepos, listUserScans, startScan, type GithubRepo, type ScanListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import LinkedAccounts from "@/components/LinkedAccounts";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, isLoading, connect } = useAuth();
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [showNewScan, setShowNewScan] = useState(false);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const groupedScans = useMemo(() => {
    const items: ScanListItem[] = [];
    const seen = new Set<string>();

    for (const scan of scans) {
      if (seen.has(scan.repo_url)) continue;
      seen.add(scan.repo_url);
      items.push(scan);
    }

    return items;
  }, [scans]);

  useEffect(() => {
    if (isLoading) return;

    if (!isLoggedIn) {
      router.replace("/auth/signin?redirect=/dashboard");
      return;
    }

    listUserScans()
      .then(setScans)
      .catch(() => setError("Failed to load scans"));
  }, [isLoading, isLoggedIn, router]);

  useEffect(() => {
    if (isLoading || !isLoggedIn || searchParams.get("autoLoadRepos") !== "1" || reposLoading || repos.length > 0) {
      return;
    }

    const loadRepos = async () => {
      setReposError(null);
      setReposLoading(true);
      try {
        const data = await listGithubRepos();
        setRepos(data);
        setShowNewScan(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load repositories";
        if (message.toLowerCase().includes("not connected")) {
          connect("github", "/dashboard?autoLoadRepos=1");
          return;
        }
        setReposError(message);
      } finally {
        setReposLoading(false);
      }
    };

    void loadRepos();
  }, [connect, isLoading, isLoggedIn, repos.length, reposLoading, searchParams]);

  useEffect(() => {
    if (showNewScan) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [showNewScan]);

  const handleStartScan = async (url?: string, force: boolean = false) => {
    const target = url || repoUrl;
    if (!target || !target.includes("github.com")) {
      setScanError("Please enter a valid GitHub repository URL");
      return;
    }

    setScanError(null);
    setScanLoading(true);

    try {
      const { scan_id } = await startScan(target, force);
      router.push(`/scan/${scan_id}`);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Failed to start scan");
      setScanLoading(false);
    }
  };

  const handleLoadRepos = async () => {
    if (repos.length > 0) {
      setShowNewScan(true);
      return;
    }

    setReposError(null);
    setReposLoading(true);
    try {
      const data = await listGithubRepos();
      setRepos(data);
      setShowNewScan(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load repositories";
      if (message.toLowerCase().includes("not connected")) {
        connect("github", "/dashboard?autoLoadRepos=1");
        return;
      }
      setReposError(message);
    } finally {
      setReposLoading(false);
    }
  };

  const handleDeleteRepo = async (repoUrl: string) => {
    setActionError(null);
    try {
      await deleteUserScans(repoUrl);
      setScans((prev) => prev.filter((scan) => scan.repo_url !== repoUrl));
      setActionSuccess("Deleted history for repository.");
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete scans");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-card p-6 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500/40 border-t-teal-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600 dark:text-neutral-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-card p-6 text-center">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button
            onClick={() => router.replace("/")}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all text-sm dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid-soft dark:bg-grid">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-neutral-100">Your scans</h1>
            <p className="text-sm text-slate-600 dark:text-neutral-500">Recent scans linked to your account.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewScan((prev) => !prev)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-all dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-1 dark:ring-cyan-500/20 dark:hover:bg-cyan-500/20"
            >
              New scan
            </button>
            <button
              onClick={handleLoadRepos}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-all dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              {reposLoading ? "Loading..." : "Pick from GitHub"}
            </button>
          </div>
        </div>

        {/* Linked accounts management */}
        <div>
          <LinkedAccounts />
        </div>

        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm shadow-lg">
            {actionSuccess}
          </div>
        )}

        {showNewScan && (
          <div className="glass-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-neutral-100 mb-3">Start a new scan</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                ref={inputRef}
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="flex-1 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
                disabled={scanLoading}
              />
              <button
                onClick={() => handleStartScan()}
                disabled={scanLoading}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-1 dark:ring-cyan-500/20 dark:hover:bg-cyan-500/20"
              >
                {scanLoading ? "Scanning..." : "Start scan"}
              </button>
            </div>
            {scanError && <p className="text-xs text-red-500 mt-2">{scanError}</p>}

            {reposError && <p className="text-xs text-red-500 mt-3">{reposError}</p>}
            {repos.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Your GitHub repos</p>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => handleStartScan(repo.html_url)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-400 hover:text-slate-900 transition-all text-xs text-slate-700 dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100"
                    >
                      {repo.full_name} {repo.private ? "(private)" : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {scans.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-slate-600 dark:text-neutral-400">
            No scans yet. Start a scan above or choose a repo from GitHub.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedScans.map((scan) => (
              <div
                key={scan.scan_id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/scan/${scan.scan_id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/scan/${scan.scan_id}`);
                }}
                className="w-full text-left glass-card p-4 hover:border-slate-300 transition-all cursor-pointer dark:hover:border-neutral-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-neutral-100 truncate">{scan.repo_url}</p>
                    <p className="text-xs text-slate-500 dark:text-neutral-500">
                      {scan.total_deps} deps · {scan.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {scan.scan_count && scan.scan_count > 1 && (
                      <div className="text-xs text-slate-500 dark:text-neutral-500">
                        {scan.scan_count} scans
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartScan(scan.repo_url, true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-all dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100"
                    >
                      Rescan
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteRepo(scan.repo_url);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 transition-all dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                    <div className="text-xs text-slate-500 dark:text-neutral-500">
                      {scan.created_at ? new Date(scan.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-card p-6 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500/40 border-t-teal-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600 dark:text-neutral-400">Loading your dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
