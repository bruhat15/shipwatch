"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

function SignInContent() {
  const { login, requestMagicLink } = useAuth();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setError(null);
    try {
      await requestMagicLink(email, redirectPath);
      setSuccess(true);
    } catch (err) {
      setError("Failed to send magic link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-card p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">Check your inbox</h1>
          <p className="text-sm text-slate-600 dark:text-neutral-400 mb-6">
            We sent a secure sign-in link to <strong>{email}</strong>.
          </p>
          <p className="text-xs text-slate-500 dark:text-neutral-500">
            You can safely close this window.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
      <div className="w-full max-w-md glass-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">Sign in to ShipWatch</h1>
        <p className="text-sm text-slate-600 dark:text-neutral-400 mb-6">
          Save scans to your dashboard and track supply chain risk over time.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3 mb-6">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="w-full px-4 py-2.5 rounded-lg bg-white/50 border border-slate-200 dark:bg-neutral-900/50 dark:border-neutral-800 text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !email}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium"
          >
            {isLoading ? "Sending..." : "Continue with Email"}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-neutral-800"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white dark:bg-neutral-950 px-2 text-slate-500 dark:text-neutral-500">
              Or continue with
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => login("github", redirectPath)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all text-sm dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </button>

          <button
            onClick={() => login("google", redirectPath)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all text-sm dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path d="M23.8 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6.7c-.3 1.5-1.2 2.8-2.6 3.6v3h4.2c2.5-2.3 3.9-5.6 3.9-9.6Z" fill="#4285F4" />
              <path d="M12 24c3.5 0 6.4-1.2 8.5-3.1l-4.2-3c-1.2.8-2.7 1.3-4.3 1.3-3.3 0-6.1-2.2-7.1-5.2H.6v3.2C2.7 21.5 7 24 12 24Z" fill="#34A853" />
              <path d="M4.9 14c-.3-.8-.5-1.6-.5-2.5s.2-1.7.5-2.5V5.8H.6C.2 7 .0 8.2 0 9.5S.2 12 .6 13.2L4.9 14Z" fill="#FBBC05" />
              <path d="M12 4.8c1.9 0 3.5.7 4.8 1.9l3.6-3.6C18.4 1.2 15.5 0 12 0 7 0 2.7 2.5.6 6.8L4.9 8c1-3 3.8-5.2 7.1-5.2Z" fill="#EA4335" />
            </svg>
            Google
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-neutral-500 mt-6 text-center">
          By continuing, you agree to store a session token locally in your browser.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-card p-6 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500/40 border-t-teal-500 animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">Loading...</h1>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
