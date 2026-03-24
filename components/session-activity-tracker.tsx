"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const SESSION_STORAGE_KEY = "felixcrm_active_session_id";
const HEARTBEAT_MS = 60_000;

async function postSessionActivity(payload: Record<string, unknown>, keepalive = false) {
  return fetch("/api/session-activity", {
    method: "POST",
    credentials: "include",
    keepalive,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function SessionActivityTracker() {
  const pathname = usePathname();
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      const existingSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existingSessionId) {
        sessionIdRef.current = existingSessionId;
        void postSessionActivity({ action: "heartbeat", sessionId: existingSessionId, path: pathname });
        return;
      }

      const response = await postSessionActivity({
        action: "start",
        path: pathname,
        userAgent: navigator.userAgent,
      }).catch(() => null);
      const payload = await response?.json().catch(() => null);
      const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
      if (!cancelled && sessionId) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
        sessionIdRef.current = sessionId;
      }
    }

    void ensureSession();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!sessionIdRef.current) return;
      void postSessionActivity({ action: "heartbeat", sessionId: sessionIdRef.current, path: pathname });
    }, HEARTBEAT_MS);

    const endSession = () => {
      if (!sessionIdRef.current) return;
      const payload = JSON.stringify({ action: "end", sessionId: sessionIdRef.current, path: pathname });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/session-activity", blob);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && sessionIdRef.current) {
        void postSessionActivity({ action: "heartbeat", sessionId: sessionIdRef.current, path: pathname });
      }
    };

    window.addEventListener("pagehide", endSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", endSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname]);

  return null;
}
