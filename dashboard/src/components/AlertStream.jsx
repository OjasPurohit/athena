import React from "react";
import { RiskBadge } from "../ui/RiskBadge";
import { motion } from "framer-motion";

export function AlertStream({ alerts = [] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-muted font-mono text-xs">
        <span>NO ACTIVE ANOMALY ALERTS DETECTED</span>
        <span className="text-[10px] mt-1 text-slate-dim">System baseline nominal</span>
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
    <div className="flex-1 overflow-y-auto max-h-[380px] divide-y divide-border-subtle font-mono text-xs pr-1">
      {alerts.map((alert, idx) => {
        const key = alert.session_id ? `${alert.session_id}-${idx}` : idx;
        const isPrefilter = alert.detection_method?.includes("RULE");

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            className="py-3.5 px-3 hover:bg-surface-hover/50 transition-colors duration-300 flex flex-col space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RiskBadge
                  level={alert.risk_level || "HIGH"}
                  score={alert.anomaly_score}
                />
                <span className="font-mono text-ivory font-medium text-xs">
                  {alert.src_ip || "UNKNOWN"}
                </span>
                <span className="text-[10px] text-slate-muted">
                  #{alert.session_id?.slice(0, 8)}
                </span>
              </div>

              <div className="flex items-center space-x-3 text-[11px] text-slate-muted">
                <span
                  className={`text-[9px] px-1 py-0.5 border ${
                    isPrefilter
                      ? "border-amber/30 text-amber bg-amber-dim/20"
                      : "border-brass/30 text-brass-light bg-brass-dim/20"
                  }`}
                >
                  {isPrefilter ? "TIER-1 RULE" : "TIER-2 ML"}
                </span>
                <span>{formatTime(alert.evaluated_at)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-text flex items-center justify-between">
              <span className="truncate pr-2">
                <span className="text-slate-muted">Reason: </span>
                <span className="text-ivory-dim">{alert.flag_reason || "ML Outlier Threshold Exceeded"}</span>
              </span>
              {alert.login_attempts_per_min !== undefined && (
                <span className="text-[10px] text-slate-muted whitespace-nowrap">
                  {alert.login_attempts_per_min.toFixed(1)} req/min
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
