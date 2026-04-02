"use client";

import { useEffect, useRef } from "react";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_REFRESH_GAP_MS = 30 * 1000;
const REFRESH_LOCK_KEY = "felixcrm_auth_refresh_lock";
const REFRESH_LOCK_TTL_MS = 45 * 1000;

function createTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function acquireRefreshLock(tabId: string) {
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { tabId?: string; startedAt?: number } | null;
      const lockTabId = typeof parsed?.tabId === "string" ? parsed.tabId : "";
      const startedAt = typeof parsed?.startedAt === "number" ? parsed.startedAt : 0;
      if (lockTabId && lockTabId !== tabId && now - startedAt < REFRESH_LOCK_TTL_MS) {
        return false;
      }
    }

    window.localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ tabId, startedAt: now }));
    return true;
  } catch {
    return true;
  }
}

function releaseRefreshLock(tabId: string) {
  try {
    const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { tabId?: string } | null;
    if (parsed?.tabId === tabId) {
      window.localStorage.removeItem(REFRESH_LOCK_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function AuthSessionKeeper() {
  const tabIdRef = useRef("");
  const lastAttemptAtRef = useRef(0);

  if (!tabIdRef.current) {
    tabIdRef.current = createTabId();
  }

  useEffect(() => {
    async function refreshSession(force = false) {
      const now = Date.now();
      if (!force && now - lastAttemptAtRef.current < MIN_REFRESH_GAP_MS) {
        return;
      }

      if (!acquireRefreshLock(tabIdRef.current)) {
        return;
      }

      lastAttemptAtRef.current = now;

      try {
        await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
      } catch {
        // Ignore keepalive failures. The next authenticated request can still recover.
      } finally {
        releaseRefreshLock(tabIdRef.current);
      }
    }

    void refreshSession();

    const intervalId = window.setInterval(() => {
      void refreshSession();
    }, REFRESH_INTERVAL_MS);

    const handleFocus = () => {
      void refreshSession(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSession(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseRefreshLock(tabIdRef.current);
    };
  }, []);

  return null;
}
