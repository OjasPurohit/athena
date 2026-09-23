import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export function TimelineChart({ sessions = [] }) {
  const data = React.useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    return [...sessions]
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map((s, index) => {
        const d = s.start_time ? new Date(s.start_time) : new Date();
        const timeLabel = d.toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
        return {
          time: timeLabel,
          index: index + 1,
          score: Number((s.anomaly_score || 0).toFixed(3)),
          ip: s.src_ip || "N/A",
          isAnomaly: !!s.is_anomaly,
          attempts: s.login_attempts_per_min || 0,
        };
      });
  }, [sessions]);

  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-slate-muted font-mono text-xs">
        <span>NO CHRONOLOGICAL SESSION TIME-SERIES AVAILABLE</span>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload;
      return (
        <div className="bg-surface border border-border-subtle p-2.5 font-mono text-xs shadow-none">
          <div className="text-[10px] text-slate-muted uppercase border-b border-border-subtle pb-1 mb-1">
            TIMESTAMP // {p.time}
          </div>
          <div className="flex justify-between space-x-4 text-ivory">
            <span>ANOMALY SCORE:</span>
            <span className={p.score >= 0.5 ? "text-brass-light font-medium" : "text-emerald-light"}>
              {p.score}
            </span>
          </div>
          <div className="flex justify-between space-x-4 text-slate-text text-[11px] mt-0.5">
            <span>SRC IP:</span>
            <span className="text-ivory-dim">{p.ip}</span>
          </div>
          <div className="flex justify-between space-x-4 text-slate-text text-[11px]">
            <span>ATTEMPT RATE:</span>
            <span>{p.attempts.toFixed(1)} req/min</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-52 font-mono text-[11px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 30, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#B8965A" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#B8965A" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1E222C" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#4F5565"
            tick={{ fill: "#7A7F8E", fontSize: 10 }}
            tickLine={false}
            interval={Math.max(0, Math.floor(data.length / 6))}
          />
          <YAxis
            domain={[0, 1]}
            stroke="#4F5565"
            tick={{ fill: "#7A7F8E", fontSize: 10 }}
            tickLine={false}
            ticks={[0, 0.25, 0.5, 0.75, 1.0]}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine 
            y={0.50} 
            stroke="#C28B47" 
            strokeDasharray="6 4" 
            strokeWidth={1} 
            strokeOpacity={0.5} 
            label={{ position: "right", value: "THRESHOLD", fill: "#C28B47", fontSize: 10 }} 
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#B8965A"
            strokeWidth={1.5}
            fill="url(#scoreGradient)"
            dot={{ r: 1.5, fill: "#B8965A", strokeWidth: 0 }}
            activeDot={{ r: 4, fill: "#E8E0D0", stroke: "#B8965A", strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
