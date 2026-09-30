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
  const [simStatus, setSimStatus] = useState(null); // null | "brute-force" | "spray" | "benign"

  useApiData(dispatch);
  useWebSocket(dispatch);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUtc = (date) => {
    return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
  };

  const runSimulation = async (mode) => {
    if (simStatus) return;
    setSimStatus(mode);
    try {
      await fetch(`${API_BASE}/api/simulate/${mode}`, { method: "POST" });
      // Immediately fetch updated snapshot in case WS is reconnecting
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

  const getStatusBadge = () => {
    switch (state.connectionStatus) {
      case "connected":
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-emerald-light bg-emerald-dim/40 border border-emerald/40 px-2.5 py-1">
            <span className="w-1.5 h-1.5 bg-emerald-light mr-1.5 rounded-none athena-breathe" />
            LIVE LINK // 2s SYNC
          </span>
        );
      case "connecting":
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-brass-light bg-brass-dim/40 border border-brass/40 px-2.5 py-1">
            <span className="w-1.5 h-1.5 bg-brass-light mr-1.5 rounded-none athena-breathe" />
            CONNECTING...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-carmine-light bg-carmine-dim/40 border border-carmine/40 px-2.5 py-1">
            <span className="w-1.5 h-1.5 bg-carmine-light mr-1.5 rounded-none" />
            DISCONNECTED // RETRYING
          </span>
        );
    }
  };

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
      {/* Top Command Header */}
      <header className="border-b border-brass-dark bg-surface px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-2.5 h-2.5 bg-brass rounded-none rotate-45" />
          <div>
            <div className="flex items-baseline space-x-3">
              <h1 className="font-serif text-2xl font-semibold tracking-wider text-ivory leading-none">
                PROJECT ATHENA
              </h1>
              <span className="text-[11px] font-mono text-slate-text tracking-terminal uppercase">
                · SECURITY OPERATIONS CENTRE
              </span>
            </div>
            <p className="text-[10px] font-sans text-slate-muted tracking-widest uppercase mt-0.5">
              COWRIE SSH HONEYPOT &amp; HYBRID ISOLATION FOREST ANOMALY DETECTION
            </p>
          </div>
        </div>

        {/* Interactive Demo Simulation Controls + Live Clock */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 border-r border-border-subtle pr-4">
            <span className="text-[10px] font-mono text-slate-muted uppercase tracking-wider mr-1 hidden xl:inline">
              LIVE DEMO:
            </span>

            <button
              onClick={() => runSimulation("brute-force")}
              disabled={!!simStatus}
              className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all cursor-pointer ${
                simStatus === "brute-force"
                  ? "bg-carmine text-ivory border-carmine-light animate-pulse"
                  : "bg-carmine-dim/40 text-carmine-light border-carmine/50 hover:bg-carmine-dim/80"
              } disabled:opacity-50`}
            >
              {simStatus === "brute-force"
                ? "⚡ Running Brute-Force..."
                : "⚡ Brute-Force Attack"}
            </button>

            <button
              onClick={() => runSimulation("spray")}
              disabled={!!simStatus}
              className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all cursor-pointer ${
                simStatus === "spray"
                  ? "bg-amber text-canvas border-amber animate-pulse"
                  : "bg-amber-dim/40 text-amber border-amber/50 hover:bg-amber-dim/80"
              } disabled:opacity-50`}
            >
              {simStatus === "spray"
                ? "🎯 Running Spray..."
                : "🎯 Credential Spray"}
            </button>

            <button
              onClick={() => runSimulation("benign")}
              disabled={!!simStatus}
              className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all cursor-pointer ${
                simStatus === "benign"
                  ? "bg-emerald text-ivory border-emerald-light animate-pulse"
                  : "bg-emerald-dim/40 text-emerald-light border-emerald/50 hover:bg-emerald-dim/80"
              } disabled:opacity-50`}
            >
              {simStatus === "benign"
                ? "✓ Running Benign Admin..."
                : "✓ Benign Admin"}
            </button>
          </div>

          <div className="text-right font-mono text-[11px] hidden sm:block">
            <div className="text-ivory-dim tracking-wider tabular-nums">
              {formatUtc(currentTime)}
            </div>
            <div className="text-[9px] text-slate-muted uppercase tracking-widest">
              SYSTEM CLOCK
            </div>
          </div>

          <div>{getStatusBadge()}</div>
        </div>
      </header>

      {/* Main Single-Screen Dashboard Grid */}
      <main className="flex-1 p-5 space-y-4 max-w-[1800px] w-full mx-auto">
        <StatsBar
          stats={state.stats}
          connectionStatus={state.connectionStatus}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Live Telemetry Feed + Score Timeline */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <Panel
              title="LIVE HONEYPOT TELEMETRY"
              subtitle="REAL-TIME SSH AUTHENTICATION &amp; COMMAND LOGS (PORT 2222)"
              badge={
                <span className="text-[10px] font-mono text-slate-muted uppercase">
                  {state.feed.length} RECENT EVENTS
                </span>
              }
              className="h-[370px] athena-scanline"
            >
              <LiveFeed events={state.feed} />
            </Panel>

            <Panel
              title="ML ANOMALY SCORE TIMELINE"
              subtitle="CHRONOLOGICAL SESSION SCORES (GREEN = SAFE, RED = THREAT)"
              badge={
                <span className="text-[10px] font-mono text-amber uppercase">
                  DECISION THRESHOLD = 0.50
                </span>
              }
              className="h-[250px]"
            >
              <TimelineChart sessions={state.sessions} />
            </Panel>
          </div>

          {/* Right Column: ML Threat Detector Gauge + Detected Alerts */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            <Panel
              title="ML THREAT DETECTOR"
              subtitle="LATEST SESSION SCORE &amp; 4-FEATURE VECTOR"
              badge={
                <span className="text-[10px] font-mono text-brass-light uppercase">
                  {latestSession
                    ? `SESSION #${latestSession.session_id?.slice(0, 8)}`
                    : "ISOLATION FOREST"}
                </span>
              }
              className="h-[370px]"
            >
              <AnomalyGauge score={gaugeScore} latestSession={latestSession} />
            </Panel>

            <Panel
              title="DETECTED SECURITY ALERTS"
              subtitle="FLAGGED BRUTE-FORCE, CREDENTIAL SPRAY &amp; ML ANOMALIES"
              badge={
                <span className="text-[10px] font-mono text-carmine-light uppercase">
                  {state.alerts.length} ACTIVE ALERTS
                </span>
              }
              className="h-[250px]"
            >
              <AlertStream alerts={state.alerts} />
            </Panel>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle border-l-2 border-l-brass-dark bg-surface px-6 py-2.5 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-muted">
        <div className="flex items-center space-x-4">
          <span>COWRIE SSH HONEYPOT</span>
          <span>•</span>
          <span>FILEBEAT + ELASTICSEARCH 8.17</span>
          <span>•</span>
          <span>SCIKIT-LEARN ISOLATION FOREST</span>
          <span>•</span>
          <span>FASTAPI WEBSOCKET ENGINE</span>
        </div>
        <div className="text-slate-dim uppercase tracking-widest text-[10px]">
          TEAM ATHENA · GROUP 4 · VIT IT
        </div>
      </footer>
    </div>
  );
}
