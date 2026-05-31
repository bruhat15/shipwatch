"use client";

import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startScan } from "@/lib/api";
import { blogPosts } from "@/data/blog-posts";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.includes("github.com")) {
      setError("Please enter a valid GitHub repository URL");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { scan_id } = await startScan(repoUrl);
      router.push(`/scan/${scan_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
      setLoading(false);
    }
  };

  const exampleRepos = [
    { name: "express", url: "https://github.com/expressjs/express" },
    { name: "next.js", url: "https://github.com/vercel/next.js" },
    { name: "fastify", url: "https://github.com/fastify/fastify" },
  ];

  const [demos, setDemos] = useState<Array<any>>([]);

  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE}/api/demos`)
      .then((r) => r.json())
      .then((data) => {
        if (mounted && data && data.demos) setDemos(data.demos);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const stats = [
    { value: "3", label: "data sources unified" },
    { value: "30s", label: "average scan time" },
    { value: "CVSS", label: "grounded risk scoring" },
    { value: "OpenSSF", label: "maintenance signals" },
  ];

  const journeySteps = [
    { title: "Paste a repo", detail: "GitHub URL in, metadata out" },
    { title: "Fuse signals", detail: "OSV, npm, GitHub, Scorecard" },
    { title: "Score risk", detail: "0-10 score with confidence" },
    { title: "Act fast", detail: "Fix commands and issues" },
  ];

  const steps = [
    {
      title: "Paste a GitHub URL",
      detail: "Start with a repo link. ShipWatch pulls dependencies instantly.",
    },
    {
      title: "Watch the live analysis",
      detail: "Streaming updates show what is risky and why in real time.",
    },
    {
      title: "Fix what matters",
      detail: "Copy ready upgrade commands and track progress in the dashboard.",
    },
  ];

  const features = [
    {
      title: "Live scanning",
      detail: "Server sent events stream results as the scan runs.",
    },
    {
      title: "Actionable fixes",
      detail: "Upgrade commands and safe version guidance in one click.",
    },
    {
      title: "CVSS-based scoring",
      detail: "Risk scores grounded in the industry standard CVSS scale.",
    },
    {
      title: "SBOM export",
      detail: "CycloneDX exports for enterprise compliance workflows.",
    },
    {
      title: "CI gate ready",
      detail: "Turn scans into automated checks inside GitHub Actions.",
    },
    {
      title: "IDE queryable",
      detail: "Use the MCP tool to explore scan data from your editor.",
    },
  ];

  const demoFindings = [
    { name: "axios", score: "6.8", status: "Warning" },
    { name: "lodash", score: "3.4", status: "Watch" },
    { name: "qs", score: "8.9", status: "Critical" },
  ];

  const latestPosts = blogPosts.slice(0, 3);

  // Enhanced demo slider: richer card content, faster pulse, arrows, pause-on-hover
  const DemoSlider = ({ demos }: { demos: any[] }) => {
    const [idx, setIdx] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
      if (!demos || demos.length === 0) return;
      const t = setInterval(() => {
        if (!paused) setIdx((i) => (demos.length ? (i + 1) % demos.length : 0));
      }, 2200);
      return () => clearInterval(t);
    }, [demos, paused]);

    if (!demos || demos.length === 0) {
      return <div className="h-44 flex items-center justify-center text-sm text-slate-600 dark:text-slate-400">No demos</div>;
    }

    const goPrev = () => setIdx((i) => (demos.length ? (i - 1 + demos.length) % demos.length : 0));
    const goNext = () => setIdx((i) => (demos.length ? (i + 1) % demos.length : 0));

    return (
      <div
        className="relative h-52 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {demos.map((d, i) => {
          const parts = (d.repo || "").split("/");
          const title = parts.slice(-2).join("/") || d.repo || `demo-${i}`;
          const summary = d.summary || {};
          const findingsCount = summary.findings_count ?? Math.max((summary.critical_count ?? 0) + (summary.warning_count ?? 0), 0);
          const scoreValue = summary.score ?? summary.top_risk?.risk_score ?? 0;
          const topRisk = summary.top_risk;
          return (
            <div
              key={d.repo || i}
              className={`absolute inset-0 transition-all duration-500 ease-out ${i === idx ? "opacity-100 translate-x-0 z-10" : "opacity-0 translate-x-3 z-0 pointer-events-none"}`}
            >
              <div className="h-full sw-card p-4 flex flex-col justify-between bg-white/90 dark:bg-slate-950/80 backdrop-blur-sm min-h-0">
                <div className="min-h-0 space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Demo results</p>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">{title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{d.repo}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <div>
                      <div className="text-xl font-semibold text-slate-900 dark:text-slate-100 leading-none">{summary.package_count ?? "—"}</div>
                      <div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">packages</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-slate-900 dark:text-slate-100 leading-none">{findingsCount ?? "—"}</div>
                      <div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">findings</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-slate-900 dark:text-slate-100 leading-none">{typeof scoreValue === "number" ? scoreValue.toFixed(1) : scoreValue}</div>
                      <div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">score</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700">{summary.critical_count ?? 0} critical</span>
                    <span className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700">{summary.warning_count ?? 0} warnings</span>
                  </div>
                  {topRisk?.name ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Top risk: {topRisk.name} {topRisk.risk_score != null ? `(${topRisk.risk_score})` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 min-h-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {d.scan_id && (
                      <a
                        href={`/scan/${d.scan_id}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors shadow-sm whitespace-nowrap"
                      >
                        Open demo
                      </a>
                    )}
                    <a
                      href={d.repo}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-400 dark:hover:border-slate-500 transition-colors whitespace-nowrap"
                    >
                      View repo
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={goPrev}
                      aria-label="Previous demo"
                      className="w-8 h-8 grid place-items-center rounded-full border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      ‹
                    </button>
                    <button
                      onClick={goNext}
                      aria-label="Next demo"
                      className="w-8 h-8 grid place-items-center rounded-full border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="absolute left-0 right-0 bottom-2 flex justify-center gap-2">
          {demos.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-slate-900 dark:bg-slate-100" : "bg-slate-400/30 dark:bg-slate-600/50"}`}
              aria-label={`Go to demo ${i + 1}`}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-mariner text-slate-900 dark:text-slate-100">
      <section className="relative overflow-hidden">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] rounded-full bg-teal-300/30 blur-[120px] animate-drift" />
        <div className="absolute bottom-[-140px] right-[-80px] w-[300px] h-[300px] rounded-full bg-orange-300/30 blur-[120px] animate-float-slow" />
        <div className="absolute inset-0 bg-grid-soft opacity-60" />

        <main className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div className="space-y-6">
            <span className="sw-pill px-3 py-1 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
              Supply chain intelligence
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display leading-tight">
              Know what is in your
              <span className="block text-gradient-mariner">dependency journey</span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-xl">
              Scan, score, and fix dependency risks in minutes. ShipWatch fuses CVSS,
              OpenSSF Scorecard, and ecosystem data into one clear plan.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={isLoggedIn ? "/dashboard" : "/auth/signin"}
                className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Get started free
              </Link>
              <a
                href="#demo"
                className="px-5 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-all dark:border-slate-700 dark:text-slate-200 dark:hover:text-slate-100"
              >
                See a demo
              </a>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
              <span className="sw-pill px-3 py-1">CVSS grounded</span>
              <span className="sw-pill px-3 py-1">OpenSSF Scorecard</span>
              <span className="sw-pill px-3 py-1">Coral cross-source JOINs</span>
            </div>
          </div>

          <div className="sw-card p-6 sm:p-8 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">Supply chain route</p>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">ShipWatch journey map</h2>
              </div>
              <span className="sw-pill px-3 py-1 text-xs text-slate-600 dark:text-slate-300">30s average</span>
            </div>

            <div className="mt-6 relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-5">
                {journeySteps.map((step, index) => (
                  <div key={step.title} className="relative">
                    <div className="absolute -left-5 top-1.5 w-3 h-3 rounded-full bg-teal-500 shadow-sm" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {String(index + 1).padStart(2, "0")} {step.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              GitHub, OSV, npm, and Scorecard signals in one view
            </div>
          </div>
        </main>
      </section>

      <section className="max-w-6xl mx-auto px-6 -mt-6">
        <div className="sw-card p-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{stat.value}</p>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex flex-col gap-2 mb-10">
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">How it works</span>
          <h2 className="text-3xl sm:text-4xl font-display text-slate-900 dark:text-slate-100">A clear path from repo to remediation</h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl">
            ShipWatch organizes noisy dependency data into a simple three step workflow.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={step.title} className="sw-card p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
                Step {index + 1}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{step.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{step.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 pb-20">
        <div className="flex flex-col gap-2 mb-10">
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Highlights</span>
          <h2 className="text-3xl sm:text-4xl font-display text-slate-900 dark:text-slate-100">Built for teams that ship fast</h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl">
            Live scanning, scoring, and fixes that help you move from insight to action.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div key={feature.title} className="sw-card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{feature.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{feature.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="demo" className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Interactive demo</span>
              <h2 className="text-3xl sm:text-4xl font-display mt-2 text-slate-900 dark:text-slate-100">Run a scan in seconds</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              Paste a GitHub repo and watch the scan stream live. Results stay public by scan id for easy sharing.
            </p>

            <form onSubmit={handleScan} className="space-y-4">
              <div className="sw-card p-2">
                <div className="flex items-center gap-3">
                  <div className="pl-2 text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                  </div>
                  <input
                    id="repo-url-input"
                    type="text"
                    placeholder="https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="flex-1 px-2 py-3 bg-transparent text-slate-900 placeholder-slate-400 outline-none text-sm dark:text-slate-100 dark:placeholder-slate-500"
                    disabled={loading}
                  />
                  <button
                    id="scan-button"
                    type="submit"
                    disabled={loading || !repoUrl}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {loading ? "Scanning..." : "Scan"}
                  </button>
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>Try:</span>
                {exampleRepos.map((repo) => (
                  <button
                    key={repo.name}
                    onClick={() => setRepoUrl(repo.url)}
                    className="sw-pill px-3 py-1 hover:border-slate-400 hover:text-slate-900 transition-all dark:hover:text-slate-100"
                    type="button"
                  >
                    {repo.name}
                  </button>
                ))}
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="sw-card p-4">
              <DemoSlider demos={demos} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {latestPosts.slice(0, 3).map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="sw-card p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Incidents</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-2">{post.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="sw-card p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-display text-slate-900 dark:text-slate-100">Protect every release</h2>
            <p className="text-slate-600 dark:text-slate-300 mt-2">Make supply chain risk visible before it ships.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={isLoggedIn ? "/dashboard" : "/auth/signin"}
              className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Get started free
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="px-5 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-all dark:border-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-slate-600 dark:text-slate-400">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">ShipWatch</p>
            <p>Open source supply chain intelligence.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/features" className="hover:text-slate-900 dark:hover:text-slate-100">Features</Link>
            <Link href="/blog" className="hover:text-slate-900 dark:hover:text-slate-100">Blog</Link>
            <Link href="/contact" className="hover:text-slate-900 dark:hover:text-slate-100">Contact</Link>
            <a href="https://withcoral.com" target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-slate-100">
              Powered by Coral
            </a>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500">© 2026 ShipWatch</div>
        </div>
      </footer>
    </div>
  );
}
