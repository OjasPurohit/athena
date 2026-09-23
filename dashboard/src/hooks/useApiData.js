import { useEffect } from "react";

/**
 * useApiData Hook
 * 
 * Performs an immediate parallel REST fetch on dashboard mount
 * so data is populated immediately without waiting for the first WebSocket broadcast tick.
 */
export function useApiData(dispatch) {
  useEffect(() => {
    let isMounted = true;
    const API_BASE = `http://${window.location.hostname}:8000/api`;

    async function fetchInitialData() {
      try {
        const [statsRes, sessionsRes, alertsRes, feedRes] = await Promise.allSettled([
          fetch(`${API_BASE}/stats`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/sessions`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/alerts`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/feed`).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!isMounted) return;

        dispatch({
          type: "SNAPSHOT_UPDATE",
          payload: {
            stats: statsRes.status === "fulfilled" ? statsRes.value : null,
            sessions: sessionsRes.status === "fulfilled" ? sessionsRes.value : [],
            alerts: alertsRes.status === "fulfilled" ? alertsRes.value : [],
            feed: feedRes.status === "fulfilled" ? feedRes.value : [],
          },
        });
      } catch (err) {
        console.warn("Bootstrap REST fetch error:", err);
      }
    }

    fetchInitialData();

    return () => {
      isMounted = false;
    };
  }, [dispatch]);
}
