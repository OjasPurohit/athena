import React, { useMemo } from "react";

export function AttackerList({ sessions = [], feed = [] }) {
  const ipStats = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      const ip = s.src_ip || "Unknown";
      if (!map[ip]) {
        map[ip] = { ip, sessions: 0, anomalies: 0, maxScore: 0, logins: 0, commands: 0, usernames: new Set() };
      }
      map[ip].sessions += 1;
      if (s.is_anomaly) map[ip].anomalies += 1;
      map[ip].maxScore = Math.max(map[ip].maxScore, s.anomaly_score || 0);
      map[ip].logins += s.failed_login_count || 0;
      map[ip].commands += s.command_count || 0;
    });

    feed.forEach((f) => {
      const ip = f.src_ip;
      if (ip && map[ip] && f.username) { map[ip].usernames.add(f.username); }
    });

    return Object.values(map)
      .sort((a, b) => b.maxScore - a.maxScore || b.sessions - a.sessions)
      .slice(0, 10);
  }, [sessions, feed]);

  if (ipStats.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-muted font-mono text-xs">
        <span>NO HOST INTRUSION VECTORS OBSERVED</span>
      </div>
    );
  }

  const maxSessionCount = Math.max(...ipStats.map((i) => i.sessions), 1);

  return (
    <div className="flex-1 overflow-y-auto max-h-[260px] font-mono text-xs pr-1">
      <div className="flex items-center justify-between px-3 pb-2 text-[10px] text-slate-muted tracking-widest uppercase border-b border-border-subtle">
        <div className="flex-1 min-w-0 pr-4">SOURCE</div>
        <div className="w-24 text-right pr-4">SESSIONS</div>
        <div className="w-32 text-right">SCORE</div>
      </div>
      
      <div className="divide-y divide-border-subtle">
        {ipStats.map((item, idx) => {
          const threatBarWidth = Math.min(100, Math.round((item.sessions / maxSessionCount) * 100));
          const isCritical = item.maxScore >= 0.7;
          const isHigh = item.maxScore >= 0.5;
          const hasAnomalies = item.anomalies > 0;
          const threatTag = isCritical ? "CRITICAL" : (isHigh || hasAnomalies ? "THREAT" : null);
          
          let colorClasses = {
            text: "text-emerald-light",
            bg: "bg-emerald",
            tagBorder: "border-emerald/30",
            tagBg: "bg-emerald-dim/30",
          };
          
          if (isCritical) {
            colorClasses = {
              text: "text-carmine-light",
              bg: "bg-carmine",
              tagBorder: "border-carmine/30",
              tagBg: "bg-carmine-dim/30",
            };
          } else if (isHigh || hasAnomalies) {
            colorClasses = {
              text: "text-brass-light",
              bg: "bg-brass",
              tagBorder: "border-brass/30",
              tagBg: "bg-brass-dim/30",
            };
          }
          
          return (
            <div
              key={item.ip}
              className="py-3 px-3 flex items-center justify-between hover:bg-surface-hover/50 transition-colors duration-300"
            >
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-muted w-4">#{idx + 1}</span>
                  <span className="font-mono text-[13px] text-ivory font-medium">
                    {item.ip}
                  </span>
                  {threatTag && (
                    <span className={`text-[9px] px-1 py-0.2 border uppercase ${colorClasses.tagBorder} ${colorClasses.tagBg} ${colorClasses.text}`}>
                      {threatTag}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-muted mt-0.5 truncate pl-6">
                  {item.usernames.size > 0 ? (
                    <span>
                      Targets:{" "}
                      <span className="text-ivory-dim">
                        {Array.from(item.usernames).slice(0, 3).join(", ")}
                      </span>
                    </span>
                  ) : (
                    <span>{item.sessions} total sessions tracked</span>
                  )}
                </div>
              </div>

              <div className="w-24 text-right pr-4 flex flex-col justify-center">
                <div className="text-[12px] text-ivory-dim">{item.sessions}</div>
                <div className="text-[10px] text-slate-muted">{item.anomalies} anomalies</div>
              </div>

              <div className="w-32 flex flex-col items-end">
                <div className="flex items-center space-x-2 text-[12px]">
                  <span
                    className={`font-mono font-medium ${colorClasses.text}`}
                  >
                    {item.maxScore.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-[3px] bg-surface-hover mt-1.5 overflow-hidden">
                  <div
                    className={`h-full ${colorClasses.bg} transition-all duration-500`}
                    style={{ width: `${threatBarWidth}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
