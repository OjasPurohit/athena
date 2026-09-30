import React from "react";

export function LiveFeed({ events = [] }) {
  if (!events || events.length === 0) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-slate-muted font-mono text-xs">
        <span>No honeypot events recorded yet</span>
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

  function getEventConfig(eventid) {
    if (eventid?.includes("login.failed")) {
      return {
        label: "AUTH_FAIL",
        tone: "text-carmine-light",
        dot: "bg-carmine-light",
      };
    }
    if (eventid?.includes("login.success")) {
      return {
        label: "AUTH_OK",
        tone: "text-emerald-light",
        dot: "bg-emerald-light",
      };
    }
    if (eventid?.includes("command.input") || eventid?.includes("command.failed")) {
      return {
        label: "CMD_EXEC",
        tone: "text-brass-light",
        dot: "bg-brass-light",
      };
    }
    if (eventid?.includes("session.connect")) {
      return {
        label: "CONNECT",
        tone: "text-ivory-dim",
        dot: "bg-slate-text",
      };
    }
    return {
      label: "DISCONNECT",
      tone: "text-slate-muted",
      dot: "bg-slate-dim",
    };
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden font-mono text-xs">
      <div className="grid grid-cols-12 gap-2 pb-2 border-b border-border-subtle text-[10px] text-slate-muted uppercase tracking-wider px-2">
        <div className="col-span-2">Time</div>
        <div className="col-span-2">Event</div>
        <div className="col-span-3">Source IP</div>
        <div className="col-span-5">Payload / Detail</div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60 pr-1">
        {events.map((evt, idx) => {
          const key = evt.timestamp
            ? `${evt.session || ""}-${evt.timestamp}-${evt.eventid}-${idx}`
            : idx;
          const cfg = getEventConfig(evt.eventid);
          const isCmd = evt.eventid?.includes("command.");

          return (
            <div
              key={key}
              className="grid grid-cols-12 gap-2 py-2 px-2 items-center hover:bg-surface-hover/40 transition-colors"
            >
              <div className="col-span-2 text-[11px] text-slate-muted tabular-nums">
                {formatTime(evt.timestamp)}
              </div>

              <div className="col-span-2 flex items-center space-x-1.5">
                <span className={`w-1.5 h-1.5 shrink-0 ${cfg.dot}`} />
                <span className={`text-[11px] ${cfg.tone}`}>{cfg.label}</span>
              </div>

              <div className="col-span-3 text-[11px] text-ivory-dim tabular-nums">
                {evt.src_ip || "172.18.0.1"}
              </div>

              <div className="col-span-5 text-[11px] text-slate-text truncate">
                {evt.username ? (
                  <span>
                    <span className="text-ivory">{evt.username}</span>
                    {evt.password && (
                      <span className="text-slate-muted">
                        {" / "}
                        <span
                          className={
                            evt.eventid?.includes("failed")
                              ? "text-carmine-light"
                              : "text-emerald-light"
                          }
                        >
                          {evt.password}
                        </span>
                      </span>
                    )}
                  </span>
                ) : isCmd ? (
                  <span className="text-ivory">
                    {evt.message?.startsWith("CMD: ")
                      ? `$ ${evt.message.slice(5)}`
                      : evt.message}
                  </span>
                ) : evt.message ? (
                  <span className="text-slate-muted">{evt.message}</span>
                ) : (
                  <span>session {evt.session?.slice(0, 8) || "N/A"}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
