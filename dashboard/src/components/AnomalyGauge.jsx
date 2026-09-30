import React from "react";
import { motion } from "framer-motion";

export function AnomalyGauge({ score = 0, latestSession = null }) {
  const normalizedScore = Math.max(0, Math.min(1, Number(score) || 0));

  const size = 210;
  const strokeWidth = 6;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;

  const totalAngle = 240;
  const totalArcLength = (totalAngle / 360) * (2 * Math.PI * radius);
  const strokeDashoffset = totalArcLength * (1 - normalizedScore);

  let statusText = "SAFE · NOMINAL BASELINE";
  let statusColor = "text-emerald-light";
  let badgeBg = "bg-emerald-dim/40 border-emerald/40 text-emerald-light";
  let strokeColor = "#4E8C73";

  if (normalizedScore >= 0.75) {
    statusText = "CRITICAL · ATTACK DETECTED";
    statusColor = "text-carmine-light";
    badgeBg = "bg-carmine-dim/40 border-carmine/40 text-carmine-light";
    strokeColor = "#B85555";
  } else if (normalizedScore >= 0.5) {
    statusText = "HIGH RISK · ANOMALY DETECTED";
    statusColor = "text-brass-light";
    badgeBg = "bg-brass-dim/40 border-brass/40 text-brass-light";
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
      ? "ML Anomaly Threshold Exceeded"
      : "Normal Sysadmin Session Baseline");

  return (
    <div className="flex flex-col items-center justify-between h-full">
      {/* Gauge Arc */}
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size * 0.78}
          viewBox={`0 0 ${size} ${size * 0.82}`}
          className="overflow-visible"
        >
          {/* Background Track */}
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

          {/* Animated Value Arc */}
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
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
            strokeLinecap="butt"
            transform={`rotate(150 ${center} ${center})`}
          />

          {/* Precision Tick Marks */}
          {ticks.map((t) => {
            const angle = 150 + t * totalAngle;
            const rad = (angle * Math.PI) / 180;
            const isThreshold = t === 0.5;
            const innerR = radius - (isThreshold ? 9 : 5);
            const outerR = radius + (isThreshold ? 9 : 5);
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
                stroke={isThreshold ? "#C28B47" : "#4F5565"}
                strokeWidth={isThreshold ? 2 : 1}
                strokeDasharray={isThreshold ? "2 2" : undefined}
              />
            );
          })}
        </svg>

        {/* Center Score Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-5 text-center pointer-events-none">
          <span
            key={normalizedScore.toFixed(3)}
            className="text-4xl font-mono font-semibold text-ivory tracking-tight tabular-nums athena-settle"
          >
            {normalizedScore.toFixed(3)}
          </span>
          <span
            className={`text-[10px] font-mono tracking-wider uppercase mt-1 px-2 py-0.5 border ${badgeBg}`}
          >
            {statusText}
          </span>
        </div>
      </div>

      {/* Scale Legend */}
      <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-muted border-t border-border-subtle pt-1.5 px-2">
        <span className="text-emerald-light">0.00 SAFE</span>
        <span className="text-amber">0.50 THRESHOLD</span>
        <span className="text-carmine-light">1.00 CRITICAL</span>
      </div>

      {/* Live 4-Feature Vector Breakdown */}
      <div className="w-full mt-3 pt-2.5 border-t border-border-subtle">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-text">
            LATEST SESSION ML FEATURES
          </span>
          <span className="text-[10px] font-mono text-brass-light">
            {method === "RULE_PREFILTER"
              ? "TIER-1 RULE + TIER-2 ML"
              : method === "BENIGN"
              ? "NOMINAL BASELINE"
              : "TIER-2 ISOLATION FOREST"}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center font-mono">
          <div className="bg-canvas/70 border border-border-subtle p-1.5">
            <div className="text-[9px] text-slate-muted uppercase">RATE/MIN</div>
            <div className="text-xs font-medium text-ivory mt-0.5 tabular-nums">
              {Number(rate).toFixed(1)}
            </div>
          </div>
          <div className="bg-canvas/70 border border-border-subtle p-1.5">
            <div className="text-[9px] text-slate-muted uppercase">FAILED</div>
            <div
              className={`text-xs font-medium mt-0.5 tabular-nums ${
                failed >= 5 ? "text-carmine-light" : "text-ivory"
              }`}
            >
              {failed}
            </div>
          </div>
          <div className="bg-canvas/70 border border-border-subtle p-1.5">
            <div className="text-[9px] text-slate-muted uppercase">USERS</div>
            <div
              className={`text-xs font-medium mt-0.5 tabular-nums ${
                uniqueUsers >= 4 ? "text-amber" : "text-ivory"
              }`}
            >
              {uniqueUsers}
            </div>
          </div>
          <div className="bg-canvas/70 border border-border-subtle p-1.5">
            <div className="text-[9px] text-slate-muted uppercase">COMMANDS</div>
            <div
              className={`text-xs font-medium mt-0.5 tabular-nums ${
                commands >= 3 ? "text-emerald-light" : "text-ivory"
              }`}
            >
              {commands}
            </div>
          </div>
        </div>

        <div
          className={`mt-2 px-2.5 py-1.5 border text-[11px] font-mono truncate ${badgeBg}`}
          title={reason}
        >
          {reason}
        </div>
      </div>
    </div>
  );
}
