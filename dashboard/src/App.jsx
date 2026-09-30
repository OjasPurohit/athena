import React, { useReducer, useState, useEffect } from "react";
import { socReducer, initialState } from "./store/reducer";
import { useWebSocket } from "./hooks/useWebSocket";
import { useApiData } from "./hooks/useApiData";
import { Panel } from "./ui/Panel";
import { StatsBar } from "./components/StatsBar";
import { AnomalyGauge } from "./components/AnomalyGauge";
import { LiveFeed } from "./components/LiveFeed";
import { AlertStream } from "./components/AlertStream";
import { TimelineChart } from "./components/TimelineChart";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [state, dispatch] = useReducer(socReducer, initialState);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [simStatus, setSimStatus] = useState(null);

  useApiData(dispatch);
  useWebSocket(dispatch);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUtc = (date) => {
    return date.toISOString().replace("T", " ").substring(11, 19) + " UTC";
  };

  const runSimulation = async (mode) => {
    if (simStatus) return;
    setSimStatus(mode);
    try {
      await fetch(`${API_BASE}/api/simulate/${mode}`, { method: "POST" });
      const [statsRes, sessionsRes, alertsRes, feedRes] = await Promise.all([
        fetch(`${API_BASE}/api/stats`),
        fetch(`${API_BASE}/api/sessions`),
        fetch(`${API_BASE}/api/alerts`),
        fetch(`${API_BASE}/api/feed`),
      ]);
      if (statsRes.ok) {
        dispatch({
          type: "SNAPSHOT_UPDATE",
          payload: {
            stats: await statsRes.json(),
            sessions: await sessionsRes.json(),
            alerts: await alertsRes.json(),
            feed: await feedRes.json(),
          },
        });
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setSimStatus(null);
    }
  };

  const isConnected = state.connectionStatus === "connected";

  const latestSession =
    state.stats.latest_session ||
    (state.sessions.length > 0 ? state.sessions[0] : null);

  const gaugeScore =
    state.stats.latest_anomaly_score !== undefined
      ? state.stats.latest_anomaly_score
      : latestSession
      ? latestSession.anomaly_score
      : state.stats.max_anomaly_score || 0;

  return (
    <div className="min-h-screen bg-canvas text-ivory flex flex-col selection:bg-brass-dim selection:text-ivory">
      {/* Header */}
      <header className="border-b border-border-subtle bg-surface px-6 h-13 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span className="font-serif text-lg font-medium tracking-wide text-ivory">
            ATHENA
          </span>
          <span className="text-border-accent">/</span>
          <span className="text-xs text-slate-text">
            SSH Honeypot &amp; Anomaly Detection
          </span>
          <span className="hidden md:inline-block text-[11px] font-mono text-slate-muted bg-canvas border border-border-subtle px-2 py-0.5">
            cowrie:2222
          </span>
        </div>

        <div className="flex items-center space-x-5">
          {/* Discreet Traffic Injection Segmented Control */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-muted hidden lg:inline">
              Simulate:
            </span>
            <div className="inline-flex border border-border-subtle bg-canvas divide-x divide-border-subtle text-xs font-mono">
              <button
                onClick={() => runSimulation("brute-force")}
                disabled={!!simStatus}
                className={`px-3 py-1 transition-colors cursor-pointer ${
                  simStatus === "brute-force"
                    ? "bg-surface-elevated text-ivory"
                    : "text-ivory-dim hover:text-ivory hover:bg-surface-hover"
                } disabled:opacity-50`}
              >
                {simStatus === "brute-force" ? "Running..." : "Brute-Force"}
              </button>

              <button
                onClick={() => runSimulation("spray")}
                disabled={!!simStatus}
                className={`px-3 py-1 transition-colors cursor-pointer ${
                  simStatus === "spray"
                    ? "bg-surface-elevated text-ivory"
                    : "text-ivory-dim hover:text-ivory hover:bg-surface-hover"
                } disabled:opacity-50`}
              >
                {simStatus === "spray" ? "Running..." : "Credential Spray"}
              </button>

              <button
                onClick={() => runSimulation("benign")}
                disabled={!!simStatus}
                className={`px-3 py-1 transition-colors cursor-pointer ${
                  simStatus === "benign"
                    ? "bg-surface-elevated text-ivory"
                    : "text-ivory-dim hover:text-ivory hover:bg-surface-hover"
                } disabled:opacity-50`}
              >
                {simStatus === "benign" ? "Running..." : "Benign Session"}
              </button>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-border-subtle hidden sm:block" />

          <div className="flex items-center space-x-4 text-xs font-mono">
            <span className="text-slate-text tabular-nums hidden sm:inline">
              {formatUtc(currentTime)}
            </span>
            <span className="inline-flex items-center text-ivory-dim">
              <span
                className={`w-1.5 h-1.5 mr-2 ${
                  isConnected
                    ? "bg-emerald-light athena-breathe"
                    : "bg-carmine-light"
                }`}
              />
              {isConnected ? "Connected" : "Reconnecting"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-5 space-y-4 max-w-[1800px] w-full mx-auto">
        <StatsBar
          stats={state.stats}
          connectionStatus={state.connectionStatus}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <Panel
              title="Honeypot Telemetry"
              subtitle="Live events from Cowrie SSH daemon"
              badge={
                <span className="text-[11px] font-mono text-slate-muted">
                  {state.feed.length} events
                </span>
              }
              className="h-[370px]"
            >
              <LiveFeed events={state.feed} />
            </Panel>

            <Panel
              title="Anomaly Score Trajectory"
              subtitle="Isolation Forest scores across sessions"
              badge={
                <span className="text-[11px] font-mono text-slate-muted">
                  threshold 0.50
                </span>
              }
              className="h-[245px]"
            >
              <TimelineChart sessions={state.sessions} />
            </Panel>
          </div>

          <div className="lg:col-span-5 flex flex-col space-y-4">
            <Panel
              title="Session Threat Evaluation"
              subtitle="Real-time ML inference &amp; feature vector"
              badge={
                <span className="text-[11px] font-mono text-slate-muted">
                  {latestSession
                    ? `session ${latestSession.session_id?.slice(0, 8)}`
                    : "isolation-forest"}
                </span>
              }
              className="h-[370px]"
            >
              <AnomalyGauge score={gaugeScore} latestSession={latestSession} />
            </Panel>

            <Panel
              title="Flagged Incidents"
              subtitle="Escalated brute-force, spray &amp; outlier sessions"
              badge={
                <span className="text-[11px] font-mono text-slate-muted">
                  {state.alerts.length} recorded
                </span>
              }
              className="h-[245px]"
            >
              <AlertStream alerts={state.alerts} />
            </Panel>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle bg-surface px-6 py-2.5 flex items-center justify-between text-[11px] font-mono text-slate-muted">
        <div className="flex items-center space-x-3">
          <span>Cowrie 2.6</span>
          <span>·</span>
          <span>Elasticsearch 8.17</span>
          <span>·</span>
          <span>Scikit-Learn Isolation Forest</span>
        </div>
        <div>Athena SOC · Group 4</div>
      </footer>
    </div>
  );
}
