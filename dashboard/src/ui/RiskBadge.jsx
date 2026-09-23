import React from "react";

/**
 * RiskBadge Component
 * 
 * Restrained security risk indicators. No glowing neon or cartoonish badges.
 * Uses muted carmine, brass, and deep emerald.
 */
export function RiskBadge({ level = "BENIGN", score = null }) {
  const normalized = (level || "BENIGN").toUpperCase();

  let style = "bg-emerald-dim/40 text-emerald-light border-emerald/40";
  let label = "BENIGN";

  if (normalized.includes("CRITICAL")) {
    style = "bg-carmine-dim/50 text-carmine-light border-carmine/50";
    label = "CRITICAL";
  } else if (normalized.includes("HIGH")) {
    style = "bg-amber-dim/50 text-amber border-amber/50";
    label = "HIGH";
  } else if (normalized.includes("MED") || normalized.includes("SUSPICIOUS")) {
    style = "bg-brass-dim/40 text-brass-light border-brass/40";
    label = "ELEVATED";
  } else if (normalized.includes("LOW") || normalized.includes("BENIGN")) {
    style = "bg-emerald-dim/40 text-emerald-light border-emerald/40";
    label = "NORMAL";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono tracking-widest uppercase border ${style}`}
    >
      <span className="w-1 h-1 rounded-none mr-1.5 bg-current opacity-80" />
      {label}
      {score !== null && score !== undefined && (
        <span className="ml-1 opacity-70 border-l border-current/30 pl-1">
          {typeof score === "number" ? score.toFixed(2) : score}
        </span>
      )}
    </span>
  );
}
