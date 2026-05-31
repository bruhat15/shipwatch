"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "./ToastContext";

async function disconnectProvider(provider: string, token: string | null) {
  const res = await fetch(`/api/auth/provider?provider=${encodeURIComponent(provider)}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to disconnect provider");
  }
  return res.json();
}

export default function LinkedAccounts() {
  const { user, token, connect, logout } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const githubConnected = !!(user && (user as any).github_connected);
  const googleConnected = !!(user && (user as any).google_connected);

  const handleDisconnect = async (provider: "github" | "google") => {
    setLoading(true);
    try {
      await disconnectProvider(provider, token);
      toast.push(`${provider} disconnected`, "success");
      // reload page to refresh user state
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      toast.push(err instanceof Error ? err.message : "Failed to disconnect", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-4 mb-6">
      <h3 className="text-sm font-semibold mb-3">Linked accounts</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <div>
              <div className="text-sm font-medium">GitHub</div>
              <div className="text-xs text-slate-500">{githubConnected ? "Connected" : "Not connected"}</div>
            </div>
          </div>
          <div>
            {githubConnected ? (
              <button disabled={loading} onClick={() => handleDisconnect("github")} className="px-3 py-1 rounded text-xs border border-red-300 text-red-600 hover:bg-red-50">Disconnect</button>
            ) : (
              <button onClick={() => connect("github")} className="px-3 py-1 rounded text-xs border">Connect</button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.8 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6.7c-.3 1.5-1.2 2.8-2.6 3.6v3h4.2c2.5-2.3 3.9-5.6 3.9-9.6Z" />
            </svg>
            <div>
              <div className="text-sm font-medium">Google</div>
              <div className="text-xs text-slate-500">{googleConnected ? "Connected" : "Not connected"}</div>
            </div>
          </div>
          <div>
            {googleConnected ? (
              <button disabled={loading} onClick={() => handleDisconnect("google")} className="px-3 py-1 rounded text-xs border border-red-300 text-red-600 hover:bg-red-50">Disconnect</button>
            ) : (
              <button onClick={() => connect("google")} className="px-3 py-1 rounded text-xs border">Connect</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
