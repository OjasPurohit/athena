import React from "react";
import { motion } from "framer-motion";

export function AnomalyGauge({ score = 0, latestSession = null }) {
  const normalizedScore = Math.max(0, Math.min(1, Number(score) || 0));

  const size = 200;
  const strokeWidth = 5;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;

  const totalAngle = 240;
  const totalArcLength = (totalAngle / 360) * (2 * Math.PI * radius);
  const strokeDashoffset = totalArcLength * (1 - normalizedScore);

  let statusText = "Nominal Baseline";
  let statusColor = "text-emerald-light";
  let strokeColor = "#4E8C73";

  if (normalizedScore >= 0.75) {
    statusText = "Critical Anomaly";
    statusColor = "text-carmine-light";
    strokeColor = "#B85555";
  } else if (normalizedScore >= 0.5) {
    statusText = "Elevated Risk";
    statusColor = "text-brass-light";
    strokeColor = "#CEAE72";
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  const rate = latestSession?.login_attempts_per_min ?? 0;
  const failed = latestSession?.failed_login_count ?? 0;
  const uniqueUsers = latestSession?.unique_usernames ?? 1;
  const commands = latestSession?.command_count ?? 0;
  const method = latestSession?.detection_method || "ISOLATION_FOREST";
  const reason =
    latestSession?.flag_reason ||
    (normalizedScore >= 0.5
      ? "Threshold exceeded"
      : "Normal sysadmin activity");

  return (
    <div className="flex flex-col items-center justify-between h-full">
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size * 0.76}
          viewBox={`0 0 ${size} ${size * 0.8}`}
          className="overflow-visible"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#252A35"
            strokeWidth={strokeWidth}
            strokeDasharray={`${totalArcLength} 9999`}
            strokeDashoffset={0}
            strokeLinecap="butt"
            transform={`rotate(150 ${center} ${center})`}
          />

          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${totalArcLength} 9999`}
            initial={{ strokeDashoffset: totalArcLength }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
            strokeLinecap="butt"
            transform={`rotate(150 ${center} ${center})`}
          />

          {ticks.map((t) => {
            const angle = 150 + t * totalAngle;
            const rad = (angle * Math.PI) / 180;
            const isThreshold = t === 0.5;
            const innerR = radius - (isThreshold ? 8 : 4);
            const outerR = radius + (isThreshold ? 8 : 4);
            const x1 = center + innerR * Math.cos(rad);
            const y1 = center + innerR * Math.sin(rad);
            const x2 = center + outerR * Math.cos(rad);
            const y2 = center + outerR * Math.sin(rad);
            return (
              <line
                key={t}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isThreshold ? "#C28B47" : "#3A4150"}
                strokeWidth={isThreshold ? 1.5 : 1}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4 text-center pointer-events-none">
          <span
            key={normalizedScore.toFixed(3)}
            className="text-4xl font-mono font-medium text-ivory tracking-tight tabular-nums athena-settle"
          >
            {normalizedScore.toFixed(3)}
          </span>
          <span className={`text-xs font-medium mt-1 ${statusColor}`}>
            {statusText}
          </span>
        </div>
      </div>

      <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-muted border-t border-border-subtle pt-1.5 px-1">
        <span>0.00</span>
        <span className="text-slate-text">0.50 threshold</span>
        <span>1.00</span>
      </div>

      <div className="w-full mt-2.5 pt-2.5 border-t border-border-subtle">
        <div className="flex items-center justify-between mb-2 text-[11px]">
          <span className="text-slate-text font-medium">
            Session Feature Vector
          </span>
          <span className="font-mono text-slate-muted">
            {method === "RULE_PREFILTER"
              ? "Tier-1 Rule + Isolation Forest"
              : method === "BENIGN"
              ? "Baseline Inlier"
              : "Isolation Forest"}
          </span>
        </div>

        <div className="grid grid-cols-4 divide-x divide-border-subtle border border-border-subtle bg-canvas/50 text-center font-mono">
          <div className="py-1.5 px-1">
            <div className="text-[10px] text-slate-muted">Rate/min</div>
            <div className="text-xs text-ivory mt-0.5 tabular-nums">
              {Number(rate).toFixed(1)}
            </div>
          </div>
          <div className="py-1.5 px-1">
            <div className="text-[10px] text-slate-muted">Failures</div>
            <div
              className={`text-xs mt-0.5 tabular-nums ${
                failed >= 5 ? "text-carmine-light" : "text-ivory"
              }`}
            >
              {failed}
            </div>
          </div>
          <div className="py-1.5 px-1">
            <div className="text-[10px] text-slate-muted">Users</div>
            <div
              className={`text-xs mt-0.5 tabular-nums ${
                uniqueUsers >= 4 ? "text-amber" : "text-ivory"
              }`}
            >
              {uniqueUsers}
            </div>
          </div>
          <div className="py-1.5 px-1">
            <div className="text-[10px] text-slate-muted">Commands</div>
            <div
              className={`text-xs mt-0.5 tabular-nums ${
                commands >= 3 ? "text-emerald-light" : "text-ivory"
              }`}
            >
              {commands}
            </div>
          </div>
        </div>

        <div
          className="mt-2 text-[11px] text-slate-text truncate font-mono"
          title={reason}
        >
          {reason}
        </div>
      </div>
    </div>
  );
}
