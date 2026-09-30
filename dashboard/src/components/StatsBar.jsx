import React from "react";

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
      label: "Ingested Events",
      meta: "Cowrie SSH telemetry",
      value: (stats.total_raw_events || 0).toLocaleString(),
      valueClass: "text-ivory",
    },
    {
      label: "Evaluated Sessions",
      meta: `${benignCount} normal · ${totalAlerts} flagged`,
      value: totalSessions.toLocaleString(),
      valueClass: "text-ivory",
    },
    {
      label: "Security Incidents",
      meta: "Rule pre-filter & ML outliers",
      value: totalAlerts.toLocaleString(),
      valueClass: totalAlerts > 0 ? "text-carmine-light" : "text-ivory",
    },
    {
      label: "Latest Session Score",
      meta: isLatestThreat ? "Threshold exceeded (≥ 0.50)" : "Within normal baseline (< 0.50)",
      value: latestScore.toFixed(3),
      valueClass: isLatestThreat ? "text-carmine-light" : "text-emerald-light",
      statusDot: isLatestThreat ? "bg-carmine-light" : "bg-emerald-light",
      statusLabel: isLatestThreat ? "Anomaly" : "Nominal",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border border-border-subtle bg-surface divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
      {metrics.map((item, idx) => (
        <div
          key={idx}
          className="px-5 py-3.5 flex flex-col justify-between hover:bg-surface-hover/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-text font-medium">
              {item.label}
            </span>
            {item.statusLabel && (
              <span className="inline-flex items-center text-[11px] font-mono text-ivory-dim">
                <span className={`w-1.5 h-1.5 mr-1.5 ${item.statusDot}`} />
                {item.statusLabel}
              </span>
            )}
          </div>

          <div className="my-1 flex items-baseline">
            <span
              className={`text-2xl font-mono font-medium tracking-tight tabular-nums ${item.valueClass}`}
            >
              {item.value}
            </span>
          </div>

          <div className="text-[11px] text-slate-muted truncate">
            {item.meta}
          </div>
        </div>
      ))}
    </div>
  );
}
