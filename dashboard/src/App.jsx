import React, { useReducer, useState, useEffect } from "react";
import { socReducer, initialState } from "./store/reducer";
import { useWebSocket } from "./hooks/useWebSocket";
import { useApiData } from "./hooks/useApiData";
import { Panel } from "./ui/Panel";
import { StatsBar } from "./components/StatsBar";
import { AnomalyGauge } from "./components/AnomalyGauge";
import { LiveFeed } from "./components/LiveFeed";
import { AlertStream } from "./components/AlertStream";
import { AttackerList } from "./components/AttackerList";
import { TimelineChart } from "./components/TimelineChart";

export default function App() {
  const [state, dispatch] = useReducer(socReducer, initialState);
  const [currentTime, setCurrentTime] = useState(new Date());

  useApiData(dispatch);
  useWebSocket(dispatch);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUtc = (date) => {
    return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
  };

  const getStatusBadge = () => {
    switch (state.connectionStatus) {
      case "connected":
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-emerald-light bg-emerald-dim/40 border border-emerald/40 px-2 py-0.5">
            <span className="w-1.5 h-1.5 bg-emerald-light mr-1.5 rounded-none athena-breathe" />
            LIVE LINK // 3s SYNC
          </span>
        );
      case "connecting":
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-brass-light bg-brass-dim/40 border border-brass/40 px-2 py-0.5">
            <span className="w-1.5 h-1.5 bg-brass-light mr-1.5 rounded-none athena-breathe" />
            CONNECTING...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-carmine-light bg-carmine-dim/40 border border-carmine/40 px-2 py-0.5">
            <span className="w-1.5 h-1.5 bg-carmine-light mr-1.5 rounded-none" />
            DISCONNECTED // RETRYING
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ivory flex flex-col selection:bg-brass-dim selection:text-ivory">
      <header className="border-b border-brass-dark bg-surface px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-2.5 h-2.5 bg-brass rounded-none rotate-45" />
          <div>
            <div className="flex items-baseline space-x-3">
              <h1 className="font-serif text-[26px] font-semibold tracking-wider text-ivory leading-none">
                PROJECT ATHENA
              </h1>
              <span className="text-[11px] font-mono text-slate-text tracking-terminal uppercase">
                · SECURITY OPERATIONS CENTRE
              </span>
            </div>
            <p className="text-[10px] font-sans text-slate-muted tracking-widest uppercase mt-0.5">
              AUTONOMOUS HONEYPOT INTELLIGENCE & HYBRID ANOMALY DETECTION
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right font-mono text-[11px]">
            <div className="text-ivory-dim tracking-wider">{formatUtc(currentTime)}</div>
            <div className="text-[9px] text-slate-muted uppercase tracking-widest">
              SYSTEM CLOCK
            </div>
          </div>
          <div>{getStatusBadge()}</div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-[1800px] w-full mx-auto">
        <StatsBar
          stats={state.stats}
          connectionStatus={state.connectionStatus}
        />

        <div className="border-t border-border-subtle opacity-40" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 flex flex-col space-y-6">
            <Panel
              title="TELEMETRY STREAM"
              subtitle="RAW COWRIE INGESTION LOGS"
              badge={
                <span className="text-[10px] font-mono text-slate-muted uppercase">
                  {state.feed.length} EVENTS BUFFERED
                </span>
              }
              className="h-[430px] athena-scanline"
            >
              <LiveFeed events={state.feed} />
            </Panel>

            <Panel
              title="TEMPORAL ANOMALY TRAJECTORY"
              subtitle="CHRONOLOGICAL ML SCORES"
              badge={
                <span className="text-[10px] font-mono text-brass-light uppercase">
                  THRESHOLD = 0.50
                </span>
              }
              className="h-[280px]"
            >
              <TimelineChart sessions={state.sessions} />
            </Panel>
          </div>

          <div className="lg:col-span-5 flex flex-col space-y-6">
            <Panel
              title="THREAT DETECTOR"
              subtitle="ISOLATION FOREST INFERENCE ENGINE"
              badge={
                <span className="text-[10px] font-mono text-slate-muted uppercase">
                  TIER-2 ML MODEL
                </span>
              }
            >
              <AnomalyGauge
                score={
                  state.stats.max_anomaly_score ||
                  (state.alerts.length > 0 ? state.alerts[0].anomaly_score : 0)
                }
              />
            </Panel>

            <Panel
              title="INTRUSION SOURCES"
              subtitle="SOURCE IP ATTRIBUTION & DENSITY"
              badge={
                <span className="text-[10px] font-mono text-slate-muted uppercase">
                  TOP VECTORS
                </span>
              }
              className="h-[280px]"
            >
              <AttackerList sessions={state.sessions} feed={state.feed} />
            </Panel>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Panel
            title="SECURITY INCIDENT STREAM"
            subtitle="FLAGGED ANOMALIES & RULE PRE-FILTER ESCALATIONS"
            badge={
              <span className="text-[10px] font-mono text-carmine-light uppercase">
                {state.alerts.length} ALERTS RECORDED
              </span>
            }
            className="min-h-[220px]"
          >
            <AlertStream alerts={state.alerts} />
          </Panel>
        </div>
      </main>

      <footer className="border-t border-border-subtle border-l-2 border-l-brass-dark bg-surface px-6 py-3 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-muted">
        <div className="flex items-center space-x-4">
          <span>ELASTICSEARCH 8.17.2</span>
          <span>•</span>
          <span>COWRIE HONEYPOT</span>
          <span>•</span>
          <span>FASTAPI ASYNC ENGINE</span>
          <span>•</span>
          <span>SCIKIT-LEARN ISOLATION FOREST</span>
        </div>
        <div className="text-slate-dim uppercase tracking-widest text-[10px]">
          TEAM ATHENA · SY 2026 · AUTONOMOUS THREAT INTELLIGENCE
        </div>
      </footer>
    </div>
  );
}
