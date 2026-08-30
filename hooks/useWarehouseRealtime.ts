"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getBoardSnapshot } from "@/lib/warehouse/repository";
import type { BoardSnapshot, RealtimeState } from "@/types/warehouse";

export function useWarehouseRealtime(initialSnapshot: BoardSnapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [state, setState] = useState<RealtimeState>("CONNECTING");
  const [error, setError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const subscribed = useRef(false);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const authoritative = await getBoardSnapshot(createClient(), initialSnapshot.warehouse.code);
      if (generation === refreshGeneration.current) {
        setSnapshot(authoritative);
        setError(null);
        if (subscribed.current && navigator.onLine) setState("CONNECTED");
      }
      return true;
    } catch (refreshError) {
      if (generation === refreshGeneration.current) {
        setError(refreshError instanceof Error ? refreshError.message : "The board could not be refreshed.");
        setState("ERROR");
      }
      return false;
    }
  }, [initialSnapshot.warehouse.code]);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const requestRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 80);
    };

    const channel = supabase
      .channel(`warehouse:${initialSnapshot.warehouse.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assets", filter: `warehouse_id=eq.${initialSnapshot.warehouse.id}` }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "asset_connections", filter: `warehouse_id=eq.${initialSnapshot.warehouse.id}` }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "zones", filter: `warehouse_id=eq.${initialSnapshot.warehouse.id}` }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings", filter: `warehouse_id=eq.${initialSnapshot.warehouse.id}` }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "asset_events", filter: `warehouse_id=eq.${initialSnapshot.warehouse.id}` }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "configurations", filter: `warehouse_id=eq.${initialSnapshot.warehouse.id}` }, requestRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed.current = true;
          setState((current) => current === "CONNECTING" ? "CONNECTING" : "RECONNECTING");
          void refresh().then((refreshed) => {
            if (refreshed) {
              setState("CONNECTED");
              setError(null);
            }
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          subscribed.current = false;
          setState("RECONNECTING");
        } else if (status === "CLOSED") {
          subscribed.current = false;
          setState(navigator.onLine ? "RECONNECTING" : "OFFLINE");
        }
      });

    const handleOffline = () => {
      subscribed.current = false;
      setState("OFFLINE");
    };
    const handleOnline = () => {
      setState("RECONNECTING");
      void refresh();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      clearTimeout(refreshTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      void supabase.removeChannel(channel);
    };
  }, [initialSnapshot.warehouse.id, refresh]);

  return { snapshot, state, error, refresh };
}
