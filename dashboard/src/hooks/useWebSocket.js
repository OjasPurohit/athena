import { useEffect, useRef } from "react";

/**
 * useWebSocket Hook
 * 
 * Manages the persistent WebSocket lifecycle to FastAPI at ws://localhost:8000/ws/live
 * - Auto-reconnects with exponential backoff on disconnect
 * - Dispatches full snapshots to the SOC state reducer
 * - Cleans up socket connections on unmount
 */
export function useWebSocket(dispatch) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Connect to FastAPI port 8000
      const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws/live`;

      dispatch({ type: "WS_STATUS", payload: "connecting" });

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          dispatch({ type: "WS_STATUS", payload: "connected" });
          retryCountRef.current = 0;
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "snapshot") {
              dispatch({ type: "SNAPSHOT_UPDATE", payload: data });
            }
          } catch (err) {
            console.error("Failed to parse WebSocket JSON message:", err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          dispatch({ type: "WS_STATUS", payload: "disconnected" });
          // Exponential backoff reconnect: 1s, 2s, 4s, capped at 10s
          const delay = Math.min(1000 * 2 ** retryCountRef.current, 10000);
          retryCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };

        ws.onerror = (err) => {
          console.warn("WebSocket error:", err);
          ws.close();
        };
      } catch (err) {
        dispatch({ type: "WS_STATUS", payload: "error" });
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [dispatch]);
}
