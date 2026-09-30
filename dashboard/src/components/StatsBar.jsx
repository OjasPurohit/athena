import React from "react";
import { motion } from "framer-motion";

export function StatsBar({ stats }) {
  const latestScore = Number(
    stats.latest_anomaly_score ?? stats.max_anomaly_score ?? 0
  );
  const isLatestThreat = latestScore >= 0.5;
  const totalSessions = stats.total_sessions || 0;
  const totalAlerts = stats.total_alerts || 0;
  const benignCount =
    stats.benign_sessions !== undefined
      ? stats.benign_sessions
      : Math.max(0, totalSessions - totalAlerts);

  const metrics = [
    {
      label: "HONEYPOT EVENTS",
      sublabel: "Raw SSH logs captured",
      value: (stats.total_raw_events || 0).toLocaleString(),
      suffix: "",
      tone: "text-ivory",
      border: "",
    },
    {
      label: "SESSIONS ANALYZED",
      sublabel: `${benignCount} Benign · ${totalAlerts} Threats`,
      value: totalSessions.toLocaleString(),
      suffix: "",
      tone: "text-ivory",
      border: "",
    },
    {
      label: "THREATS DETECTED",
      sublabel: "Brute-Force, Spray & ML Outliers",
      value: totalAlerts.toLocaleString(),
      suffix: "",
      tone: totalAlerts > 0 ? "text-carmine-light" : "text-ivory",
      border: totalAlerts > 0 ? "border-l-2 border-l-carmine" : "",
    },
    {
      label: "LATEST SESSION SCORE",
      sublabel: isLatestThreat
        ? "THREAT DETECTED (≥ 0.50)"
        : "NORMAL BASELINE (< 0.50)",
      value: latestScore.toFixed(3),
      suffix: isLatestThreat ? "THREAT" : "SAFE",
      badgeClass: isLatestThreat
        ? "bg-carmine-dim/60 text-carmine-light border border-carmine/50"
        : "bg-emerald-dim/60 text-emerald-light border border-emerald/50",
      tone: isLatestThreat ? "text-brass-light" : "text-emerald-light",
      border: isLatestThreat
        ? "border-l-2 border-l-amber"
        : "border-l-2 border-l-emerald",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="grid grid-cols-2 lg:grid-cols-4 border border-border-subtle bg-surface divide-y lg:divide-y-0 lg:divide-x divide-border-subtle"
    >
      {metrics.map((item, idx) => (
        <div
          key={idx}
          className={`px-5 py-3.5 flex flex-col justify-between relative hover:bg-surface-hover/40 transition-colors duration-200 ${item.border}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-wider text-slate-text uppercase">
              {item.label}
            </span>
            {item.suffix && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 uppercase tracking-wider ${item.badgeClass}`}
              >
                {item.suffix}
              </span>
            )}
          </div>

          <div className="my-1 flex items-baseline space-x-2">
            <span
              className={`text-2xl font-mono font-semibold tracking-tight tabular-nums ${item.tone}`}
            >
              {item.value}
            </span>
          </div>

          <div className="text-[11px] font-sans text-slate-muted truncate">
            {item.sublabel}
          </div>
        </div>
      ))}
    </motion.div>
  );
}
