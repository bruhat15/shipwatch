import Link from "next/link";

type FeatureSection = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  previewTitle: string;
  previewLines: string[];
};

const sections: FeatureSection[] = [
  {
    eyebrow: "Live scanning",
    title: "See risks appear in real time",
    description:
      "Server sent events stream every package as it is analyzed so teams can follow progress without waiting for the full scan to finish.",
    bullets: [
      "Streaming status updates for every dependency",
      "Progress bar and live risk distribution",
      "Demo friendly sharing by scan id",
    ],
    previewTitle: "Scan stream",
    previewLines: [
      "express@4.18.2 - score 2.1 (healthy)",
      "qs@6.11.0 - score 8.9 (critical)",
      "axios@1.6.2 - score 6.8 (warning)",
    ],
  },
  {
    eyebrow: "Risk scoring",
    title: "CVSS grounded scoring with confidence",
    description:
      "Security, maintenance, and ecosystem signals roll into a 0-10 score with a confidence badge so teams know when to dig deeper.",
    bullets: [
      "CVSS numeric extraction from OSV",
      "OpenSSF Scorecard health signals",
      "Confidence indicator for missing data",
    ],
    previewTitle: "Score breakdown",
    previewLines: [
      "Security 7.5 - CVSS high",
      "Maintenance 5.0 - low activity",
      "Ecosystem 2.1 - strong adoption",
    ],
  },
  {
    eyebrow: "Fix recommendations",
    title: "Actionable fixes your team can ship",
    description:
      "Copy ready upgrade commands and safe version guidance keep remediation steps short and clear.",
    bullets: [
      "Copy paste upgrade commands",
      "Recommended safe versions",
      "Context on breaking changes",
    ],
    previewTitle: "Fix card",
    previewLines: [
      "npm install qs@6.11.2",
      "Patch to resolve CVE-2023-0000",
      "Confidence: High",
    ],
  },
  {
    eyebrow: "GitHub issues",
    title: "Turn findings into tracked work",
    description:
      "Generate GitHub issues with context, owners, and fix guidance so the right team can act quickly.",
    bullets: [
      "Pre filled issue templates",
      "Attach scan metadata",
      "Assign to repo owners",
    ],
    previewTitle: "Issue template",
    previewLines: [
      "Title: Upgrade qs to fix CVE",
      "Impact: Request parsing",
      "Suggested owner: platform team",
    ],
  },
  {
    eyebrow: "Policy engine",
    title: "Define what is allowed to ship",
    description:
      "Set thresholds for risk, maintenance, and license signals so teams can enforce policy consistently.",
    bullets: [
      "Block critical risk packages",
      "Alert on low maintenance scores",
      "License conflict detection",
    ],
    previewTitle: "Policy rule",
    previewLines: [
      "If risk score >= 7.0 then block",
      "If license = GPL then warn",
      "If confidence = low then review",
    ],
  },
  {
    eyebrow: "SBOM export",
    title: "Compliance ready SBOMs",
    description:
      "Export CycloneDX SBOMs to meet compliance, procurement, and audit requirements.",
    bullets: [
      "CycloneDX JSON export",
      "One click download",
      "Attach to release workflows",
    ],
    previewTitle: "SBOM export",
    previewLines: [
      "components: 128",
      "format: CycloneDX 1.5",
      "generated: 2026-05-29",
    ],
  },
  {
    eyebrow: "CI gate",
    title: "Protect every release",
    description:
      "Drop a GitHub Action into your pipeline and block releases that exceed your risk threshold.",
    bullets: [
      "Fail the build on high risk",
      "Export reports into artifacts",
      "Send results to Slack",
    ],
    previewTitle: "Action snippet",
    previewLines: [
      "uses: shipwatch/scan@v1",
      "with: risk-threshold: 6.0",
      "output: report.md",
    ],
  },
  {
    eyebrow: "MCP integration",
    title: "Query scans from your editor",
    description:
      "Use the ShipWatch MCP server to explore scan data from your IDE or AI assistant.",
    bullets: [
      "Ask questions about dependencies",
      "Filter by risk or license",
      "Export findings on demand",
    ],
    previewTitle: "MCP query",
    previewLines: [
      "list packages where risk > 7",
      "show fixes for qs",
      "export report for repo",
    ],
  },
];

function FeaturePanel({ section, reverse }: { section: FeatureSection; reverse?: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
      <div className={reverse ? "md:order-2" : ""}>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">{section.eyebrow}</p>
        <h2 className="text-2xl sm:text-3xl font-display mt-3 text-slate-900 dark:text-slate-100">{section.title}</h2>
        <p className="text-slate-600 dark:text-slate-300 mt-3">{section.description}</p>
        <ul className="mt-5 space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "md:order-1" : ""}>
        <div className="sw-card p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{section.previewTitle}</p>
          <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
            {section.previewLines.map((line) => (
              <div key={line} className="sw-pill px-3 py-2">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-mariner text-slate-900 dark:text-slate-100">
      <header className="max-w-6xl mx-auto px-6 pt-16 pb-12">
        <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Features</span>
        <h1 className="text-3xl sm:text-4xl font-display mt-2 text-slate-900 dark:text-slate-100">Everything you need to secure dependencies</h1>
        <p className="text-slate-600 dark:text-slate-300 max-w-2xl mt-3">
          ShipWatch combines cross source intelligence with focused workflows so teams can move from insight to remediation.
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-20 space-y-16">
        {sections.map((section, index) => (
          <FeaturePanel key={section.title} section={section} reverse={index % 2 === 1} />
        ))}
      </main>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="sw-card p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-display text-slate-900 dark:text-slate-100">Ready to scan your repo?</h2>
            <p className="text-slate-600 dark:text-slate-300 mt-2">Start a free scan and see the full risk report in minutes.</p>
          </div>
          <Link
            href="/auth/signin"
            className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Start scanning
          </Link>
        </div>
      </section>
    </div>
  );
}
