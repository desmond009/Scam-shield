"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AlertStreamEvent } from "@/lib/types";

export type StreamStatus = "connecting" | "live" | "reconnecting";

const HIGHLIGHT_MS = 8_000;

/**
 * Subscribes to the analyst SSE stream. New or reviewed alerts invalidate the cached queue and detail,
 * and ids of freshly arrived alerts are kept for a few seconds so the list can highlight them.
 */
export function useAlertStream() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    const source = new EventSource("/api/alerts/stream", { withCredentials: true });

    const markFresh = (id: string) => {
      setFreshIds((prev) => new Set(prev).add(id));
      clearTimeout(pending.get(id));
      pending.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          setFreshIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, HIGHLIGHT_MS),
      );
    };

    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("reconnecting");
    source.onmessage = (e: MessageEvent<string>) => {
      let event: AlertStreamEvent;
      try {
        event = JSON.parse(e.data) as AlertStreamEvent;
      } catch {
        return;
      }
      if (event.type === "connected") {
        setStatus("live");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      if (event.type === "alert") {
        markFresh(event.alert.id);
        queryClient.invalidateQueries({ queryKey: ["alert", event.alert.id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["alert", event.alertId] });
      }
    };

    return () => {
      source.close();
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [queryClient]);

  return { status, freshIds };
}
