import React from "react";

export function AlertStream({ alerts = [] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center text-slate-muted font-mono text-xs">
        <span>No active security incidents</span>
      </div>
    );
  }

  function formatTime(timestamp) {
    if (!timestamp) return "--:--:--";
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString("en-GB", { hour12: false });
    } catch {
      return timestamp.slice(11, 19) || timestamp;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60 font-mono text-xs pr-1">
      {alerts.map((alert, idx) => {
        const key = alert.session_id ? `${alert.session_id}-${idx}` : idx;
        const isPrefilter = alert.detection_method?.includes("RULE");
        const score = Number(alert.anomaly_score || 0).toFixed(2);

        return (
          <div
            key={key}
            className="py-2.5 px-2 hover:bg-surface-hover/40 transition-colors flex flex-col space-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="inline-flex items-center text-[11px] text-carmine-light font-medium">
                  <span className="w-1.5 h-1.5 bg-carmine-light mr-1.5" />
                  {score}
                </span>
                <span className="text-ivory font-medium text-xs tabular-nums">
                  {alert.src_ip || "172.18.0.1"}
                </span>
                <span className="text-[11px] text-slate-muted">
                  {alert.session_id?.slice(0, 8)}
                </span>
              </div>

              <div className="flex items-center space-x-3 text-[11px] text-slate-muted">
                <span className="text-ivory-dim">
                  {isPrefilter ? "Rule Pre-filter" : "Isolation Forest"}
                </span>
                <span className="tabular-nums">
                  {formatTime(alert.start_time || alert.evaluated_at)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-text flex items-center justify-between">
              <span className="truncate pr-2">
                {alert.flag_reason || "Anomaly threshold exceeded"}
              </span>
              {alert.failed_login_count !== undefined && (
                <span className="text-[11px] text-slate-muted whitespace-nowrap tabular-nums">
                  {alert.failed_login_count} failures ·{" "}
                  {(alert.login_attempts_per_min || 0).toFixed(0)}/min
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
