"use client";

import { useState } from "react";
import { submitContact } from "@/lib/api";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await submitContact(form);
      setSubmitted(true);
      setForm({ name: "", email: "", message: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mariner text-slate-900 dark:text-slate-100">
      <main className="max-w-5xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-[0.9fr_1.1fr] gap-10">
        <div className="space-y-4">
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Contact</span>
          <h1 className="text-3xl sm:text-4xl font-display text-slate-900 dark:text-slate-100">Talk to the ShipWatch team</h1>
          <p className="text-slate-600 dark:text-slate-300">
            Share a repo, a use case, or an integration idea. We will help you plan the right supply chain workflow.
          </p>
          <div className="sw-card p-6 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Email</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">hello@shipwatch.dev</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Response time</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Within 2 business days</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Focus areas</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Security audits, CI gates, SBOM exports, and remediation playbooks.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="sw-card p-8 space-y-5">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Work email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Message</label>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Tell us what you want to achieve"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 text-white py-3 text-sm font-semibold hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitted ? "Thanks, we will reply soon" : loading ? "Sending..." : "Send message"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            We will send your message to the ShipWatch team inbox.
          </p>
        </form>
      </main>
    </div>
  );
}
