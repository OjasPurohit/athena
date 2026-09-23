import React from "react";
import { motion } from "framer-motion";

export function StatsBar({ stats, connectionStatus }) {
  const metrics = [
    {
      label: "INGESTED TELEMETRY",
      sublabel: "COWRIE RAW LOGS",
      value: stats.total_raw_events || 0,
      decimals: 0,
      prefix: "",
      suffix: " EVT",
    },
    {
      label: "EVALUATED SESSIONS",
      sublabel: "AGGREGATED SESSIONS",
      value: stats.total_sessions || 0,
      decimals: 0,
      prefix: "",
      suffix: "",
    },
    {
      label: "FLAGGED ANOMALIES",
      sublabel: `${stats.active_alerts || 0} ACTIVE / RECENT`,
      value: stats.total_alerts || 0,
      decimals: 0,
      prefix: "",
      suffix: "",
      highlight: (stats.total_alerts || 0) > 0,
    },
    {
      label: "MEAN ANOMALY SCORE",
      sublabel: "ISOLATION FOREST",
      value: stats.avg_anomaly_score || 0,
      decimals: 3,
      prefix: "",
      suffix: "",
    },
    {
      label: "PEAK THREAT SCORE",
      sublabel: "MAX SESSION VECTOR",
      value: stats.max_anomaly_score || 0,
      decimals: 3,
      prefix: "",
      suffix: "",
      highlight: (stats.max_anomaly_score || 0) > 0.5,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="grid grid-cols-2 md:grid-cols-5 border border-border-subtle bg-surface divide-y md:divide-y-0 md:divide-x divide-border-subtle"
    >
      {metrics.map((item, idx) => {
        const highlightBorderClass = item.highlight 
          ? (idx === 2 ? "border-l-2 border-l-carmine" : idx === 4 ? "border-l-2 border-l-amber" : "") 
          : "";

        return (
          <div key={idx} className={`px-5 py-4 flex flex-col justify-between relative group hover:bg-surface-hover/50 transition-colors duration-300 ${highlightBorderClass}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono tracking-widest text-slate-text uppercase">
                {item.label}
              </span>
              {item.highlight && (
                <span className="w-1.5 h-1.5 bg-brass rounded-none rotate-45" />
              )}
            </div>

            <div className="flex items-baseline space-x-1 my-1">
              <span className={`text-[26px] font-mono font-medium tracking-tight tabular-nums ${item.highlight ? 'text-brass-light' : 'text-ivory'}`}>
                {typeof item.value === "number"
                  ? item.value.toLocaleString(undefined, {
                      minimumFractionDigits: item.decimals,
                      maximumFractionDigits: item.decimals,
                    })
                  : item.value}
              </span>
              {item.suffix && (
                <span className="text-[11px] font-mono text-slate-muted">
                  {item.suffix}
                </span>
              )}
            </div>

            <div className="text-[10px] font-mono text-slate-muted tracking-wider truncate">
              {item.sublabel}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
