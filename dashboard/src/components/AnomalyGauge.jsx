import React from "react";
import { motion } from "framer-motion";

export function AnomalyGauge({ score = 0, label = "SYSTEM PEAK ANOMALY SCORE" }) {
  const normalizedScore = Math.max(0, Math.min(1, Number(score) || 0));

  const size = 260;
  const strokeWidth = 5;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;

  const totalAngle = 240;
  const totalArcLength = (totalAngle / 360) * (2 * Math.PI * radius);
  const strokeDashoffset = totalArcLength * (1 - normalizedScore);

  let statusText = "NOMINAL BASELINE";
  let statusColor = "text-emerald-light";
  let strokeColor = "#3D6E5A";

  if (normalizedScore >= 0.7) {
    statusText = "CRITICAL ANOMALY";
    statusColor = "text-carmine-light";
    strokeColor = "#9B4040";
  } else if (normalizedScore >= 0.5) {
    statusText = "ELEVATED DEVIATION";
    statusColor = "text-brass-light";
    strokeColor = "#B8965A";
  } else if (normalizedScore >= 0.3) {
    statusText = "MILD ACTIVITY";
    statusColor = "text-emerald-light";
    strokeColor = "#5A7A5A";
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className="flex flex-col items-center justify-center p-2 relative">
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size * 0.82}
          viewBox={`0 0 ${size} ${size * 0.85}`}
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
            transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
            strokeLinecap="butt"
            transform={`rotate(150 ${center} ${center})`}
          />

          {ticks.map((tick, i) => {
            const tickAngle = 150 + tick * totalAngle;
            const rad = (tickAngle * Math.PI) / 180;
            const tickLen = 6;
            const gap = 3;
            const x1 = center + (radius + gap) * Math.cos(rad);
            const y1 = center + (radius + gap) * Math.sin(rad);
            const x2 = center + (radius + gap + tickLen) * Math.cos(rad);
            const y2 = center + (radius + gap + tickLen) * Math.sin(rad);
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#252A35" strokeWidth={1.5}
                strokeLinecap="butt"
              />
            );
          })}

          {(() => {
            const thresholdAngle = 150 + 0.5 * totalAngle;
            const rad = (thresholdAngle * Math.PI) / 180;
            const x1 = center + (radius - 10) * Math.cos(rad);
            const y1 = center + (radius - 10) * Math.sin(rad);
            const x2 = center + (radius + 10) * Math.cos(rad);
            const y2 = center + (radius + 10) * Math.sin(rad);
            return (
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#C28B47" strokeWidth={1.5}
                strokeDasharray="2 2" opacity={0.7}
              />
            );
          })()}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6 text-center pointer-events-none">
          <span
            key={normalizedScore.toFixed(2)}
            className="text-5xl font-mono font-medium text-ivory tracking-tighter athena-settle"
          >
            {normalizedScore.toFixed(3)}
          </span>
          <span className={`text-[10px] font-mono tracking-widest uppercase mt-1 ${statusColor}`}>
            {statusText}
          </span>
        </div>
      </div>

      <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-muted border-t border-border-subtle pt-2 mt-1 px-4">
        <span>0.00 BASELINE</span>
        <span className="text-amber">0.50 THRESHOLD</span>
        <span>1.00 OUTLIER</span>
      </div>
      
      <div className="mt-4 text-[10px] font-sans tracking-widest uppercase text-slate-muted">
        {label}
      </div>
    </div>
  );
}
