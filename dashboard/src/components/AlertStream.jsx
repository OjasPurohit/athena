import React from "react";
import { RiskBadge } from "../ui/RiskBadge";
import { motion } from "framer-motion";

export function AlertStream({ alerts = [] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center text-slate-muted font-mono text-xs">
        <span>NO ACTIVE ANOMALY ALERTS DETECTED</span>
        <span className="text-[10px] mt-1 text-slate-dim">
          System baseline nominal
        </span>
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
    <div className="flex-1 overflow-y-auto divide-y divide-border-subtle font-mono text-xs pr-1">
      {alerts.map((alert, idx) => {
        const key = alert.session_id ? `${alert.session_id}-${idx}` : idx;
        const isPrefilter = alert.detection_method?.includes("RULE");

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="py-2.5 px-2.5 hover:bg-surface-hover/50 transition-colors duration-200 flex flex-col space-y-1 border-l-2 border-l-carmine"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RiskBadge
                  level={alert.risk_level || "HIGH"}
                  score={alert.anomaly_score}
                />
                <span className="font-mono text-ivory font-medium text-xs tabular-nums">
                  {alert.src_ip || "172.18.0.1"}
                </span>
                <span className="text-[10px] text-slate-muted">
                  #{alert.session_id?.slice(0, 8)}
                </span>
              </div>

              <div className="flex items-center space-x-2 text-[10px] text-slate-muted">
                <span
                  className={`px-1.5 py-0.5 border ${
                    isPrefilter
                      ? "border-amber/40 text-amber bg-amber-dim/30"
                      : "border-brass/40 text-brass-light bg-brass-dim/30"
                  }`}
                >
                  {isPrefilter ? "TIER-1 RULE" : "TIER-2 ML"}
                </span>
                <span className="tabular-nums">
                  {formatTime(alert.start_time || alert.evaluated_at)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-ivory-dim flex items-center justify-between">
              <span className="truncate pr-2">
                {alert.flag_reason || "ML Outlier Threshold Exceeded"}
              </span>
              {alert.failed_login_count !== undefined && (
                <span className="text-[10px] text-carmine-light whitespace-nowrap tabular-nums">
                  {alert.failed_login_count} failed ·{" "}
                  {(alert.login_attempts_per_min || 0).toFixed(0)}/min
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
