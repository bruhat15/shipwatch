"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const AUTH_STORAGE_KEY = "shipwatch_token";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  github_connected?: boolean;
  google_connected?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  token: string | null;
  login: (provider: "github" | "google", redirectPath?: string) => void;
  connect: (provider: "github" | "google", redirectPath?: string) => void;
  logout: () => void;
  setToken: (token: string | null) => void;
  requestMagicLink: (email: string, redirectPath?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

function storeToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error("Not authenticated");
  }
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setToken = (value: string | null) => {
    storeToken(value);
    setTokenState(value);
  };

  useEffect(() => {
    setTokenState(getStoredToken());
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchMe(token)
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setTokenState(null);
          storeToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = (provider: "github" | "google", redirectPath: string = "/dashboard") => {
    const url = `${API_BASE}/api/auth/${provider}?redirect=${encodeURIComponent(redirectPath)}`;
    window.location.href = url;
  };

  const connect = (provider: "github" | "google", redirectPath: string = "/dashboard") => {
    const endpoint = `${API_BASE}/api/auth/${provider}/connect-url?redirect=${encodeURIComponent(redirectPath)}`;
    const token = getStoredToken();
    if (!token) {
      // if not logged in, fall back to login flow
      const fallback = `${API_BASE}/api/auth/${provider}?redirect=${encodeURIComponent(redirectPath)}`;
      window.location.href = fallback;
      return;
    }

    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch connect url");
        return res.json();
      })
      .then((data) => {
        if (data && data.url) window.location.href = data.url;
      })
      .catch(() => {
        // fallback: navigate to connect endpoint (may show not authenticated)
        window.location.href = `${API_BASE}/api/auth/${provider}/connect?redirect=${encodeURIComponent(redirectPath)}`;
      });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const requestMagicLink = async (email: string, redirectPath: string = "/dashboard") => {
    const res = await fetch(`${API_BASE}/api/auth/email/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirect_path: redirectPath }),
    });
    if (!res.ok) {
      throw new Error("Failed to request magic link");
    }
  };

  const value = useMemo(
    () => ({
      user,
      isLoggedIn: Boolean(user),
      isLoading,
      token,
      login,
      connect,
      logout,
      setToken,
      requestMagicLink,
    }),
    [user, isLoading, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
