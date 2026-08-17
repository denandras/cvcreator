"use client";

import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Client-side keepalive hook.
 *
 * Sends a lightweight GET /api/ping every 5 minutes to refresh the
 * Supabase session, preventing idle-timeout logouts.
 *
 * Behaviour:
 * - Only runs when a session exists.
 * - Pauses when the tab is hidden (document.hidden) and resumes when visible.
 * - Cleans up on unmount / when session is lost.
 */
export function useKeepalive(session: Session | null) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // No session — nothing to keep alive.
    if (!session) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const ping = async () => {
      // Don't ping when the tab is hidden — the session will be refreshed
      // naturally when the user returns and visibility changes.
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        await fetch("/api/ping", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        // Network errors are non-fatal — the next tick will retry.
      }
    };

    // Start the interval.
    timerRef.current = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [session]);
}