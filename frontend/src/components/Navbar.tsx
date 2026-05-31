"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function Navbar() {
  const pathname = usePathname();
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const { theme, toggleTheme, isReady } = useTheme();

  const isMarketing =
    pathname === "/" ||
    pathname.startsWith("/features") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/contact");

  const navBaseClass = isMarketing
    ? "bg-white/80 text-slate-900 border-slate-200/80 dark:bg-slate-950/80 dark:text-slate-100 dark:border-slate-800/60"
    : "bg-white/80 text-slate-900 border-slate-200/80 dark:bg-neutral-950/80 dark:text-neutral-100 dark:border-neutral-800/50";
  const linkClass = isMarketing
    ? "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
    : "text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-200";
  const activeClass = isMarketing
    ? "text-slate-900 dark:text-slate-100"
    : "text-slate-900 dark:text-neutral-100";
  const brandAccent = isMarketing ? "text-teal-600 dark:text-cyan-400" : "text-cyan-600 dark:text-cyan-400";
  const signInClass = isMarketing
    ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-1 dark:ring-cyan-500/20 dark:hover:bg-cyan-500/20";
  const signOutClass = isMarketing
    ? "bg-slate-900/10 text-slate-700 hover:bg-slate-900/20 dark:bg-slate-100/10 dark:text-slate-200 dark:hover:bg-slate-100/20"
    : "bg-slate-900/10 text-slate-700 hover:bg-slate-900/20 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700";

  const navLinks = [
    { href: "/features", label: "Features" },
    { href: "/blog", label: "Blog" },
    { href: "/contact", label: "Contact" },
  ];

  if (pathname.startsWith("/scan/") || pathname.startsWith("/auth/callback")) {
    return null;
  }

  return (
    <nav className={`sticky top-0 z-40 backdrop-blur-xl border-b ${navBaseClass}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">
              Ship<span className={brandAccent}>Watch</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-4 text-sm">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors ${active ? activeClass : linkClass}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          {isLoggedIn && (
            <Link href="/dashboard" className={`text-sm transition-colors ${linkClass}`}>
              Dashboard
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? (
            <span className="text-xs text-slate-500 dark:text-neutral-500">Checking session...</span>
          ) : isLoggedIn ? (
            <div className="flex items-center gap-2">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  className="w-7 h-7 rounded-full border border-neutral-700"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700" />
              )}
              <span className="text-xs text-neutral-300 hidden sm:inline">
                {user?.name || user?.email || "Signed in"}
              </span>
              <button
                onClick={logout}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${signOutClass}`}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/auth/signin"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${signInClass}`}
            >
              Sign in
            </Link>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all dark:border-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
            aria-label="Toggle theme"
          >
            {isReady && theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </div>
    </nav>
  );
}
