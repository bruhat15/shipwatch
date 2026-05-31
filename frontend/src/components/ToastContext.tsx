"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

type Toast = { id: string; message: string; type?: "success" | "error" | "info" };

const ToastContext = createContext<{
  push: (msg: string, type?: Toast["type"]) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).slice(2, 9);
    const t = { id, message, type };
    setToasts((s) => [...s, t]);
    setTimeout(() => {
      setToasts((s) => s.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-2 rounded-lg text-sm shadow-md max-w-md w-full text-center ${t.type === "success" ? "bg-teal-600 text-white" : t.type === "error" ? "bg-red-600 text-white" : "bg-neutral-800 text-white"}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
