/**
 * Athena SOC Dashboard — State Reducer
 * 
 * Centralized state store for incoming real-time telemetry.
 * Receives snapshot events from WebSocket or bootstrap REST fetch,
 * performing immutable state transitions.
 */

export const initialState = {
  stats: {
    total_raw_events: 0,
    total_sessions: 0,
    total_alerts: 0,
    active_alerts: 0,
    avg_anomaly_score: 0,
    max_anomaly_score: 0,
    last_updated: null,
  },
  sessions: [],
  alerts: [],
  feed: [],
  connectionStatus: "connecting", // "connected" | "connecting" | "disconnected" | "error"
  lastHeartbeat: null,
};

export function socReducer(state, action) {
  switch (action.type) {
    case "WS_STATUS":
      return {
        ...state,
        connectionStatus: action.payload,
      };

    case "SNAPSHOT_UPDATE": {
      const data = action.payload;
      return {
        ...state,
        stats: data.stats || state.stats,
        sessions: data.sessions || state.sessions,
        alerts: data.alerts || state.alerts,
        feed: data.feed || state.feed,
        lastHeartbeat: new Date().toISOString(),
      };
    }

    case "FEED_EVENT": {
      // Prepend event, deduplicate by session+timestamp if possible, limit to 40
      const updatedFeed = [action.payload, ...state.feed.slice(0, 39)];
      return {
        ...state,
        feed: updatedFeed,
      };
    }

    default:
      return state;
  }
}
