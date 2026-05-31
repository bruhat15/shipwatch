"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    const token = searchParams.get("token");
    const redirectPath = searchParams.get("redirect") || "/dashboard";

    if (err) {
      setError(err);
      return;
    }

    if (!token) {
      setError("Missing authentication token");
      return;
    }

    setToken(token);
    router.replace(redirectPath);
  }, [router, searchParams, setToken]);

  return (
    <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
      <div className="w-full max-w-md glass-card p-6 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-red-400 mb-2">Sign in failed</h1>
            <p className="text-sm text-slate-600 dark:text-neutral-400 mb-4">{error}</p>
            <button
              onClick={() => router.replace("/auth/signin")}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all text-sm dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-teal-500/40 border-t-teal-500 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">Signing you in...</h1>
            <p className="text-sm text-slate-600 dark:text-neutral-400">Preparing your dashboard.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-grid-soft dark:bg-grid flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-card p-6 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500/40 border-t-teal-500 animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2 text-slate-900 dark:text-neutral-100">Loading...</h1>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
