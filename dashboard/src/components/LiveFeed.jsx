import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LiveFeed({ events = [] }) {
  if (!events || events.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-muted font-mono text-xs">
        <span className="animate-pulse">WAITING FOR HONEYPOT TELEMETRY STREAM...</span>
        <span className="text-[10px] mt-1 text-slate-dim">Awaiting connection on Cowrie port 2222</span>
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

  function getEventLabel(eventid) {
    if (!eventid) return "EVENT";
    if (eventid.includes("login.failed")) return "AUTH_FAIL";
    if (eventid.includes("login.success")) return "AUTH_SUCCESS";
    if (eventid.includes("command.input")) return "CMD_EXEC";
    if (eventid.includes("session.connect")) return "CONNECT";
    if (eventid.includes("session.closed")) return "DISCONNECT";
    return eventid.replace("cowrie.", "").toUpperCase();
  }

  function getEventBadge(eventid) {
    if (eventid?.includes("login.failed")) {
      return "text-carmine-light bg-carmine-dim/30 border-carmine/30";
    }
    if (eventid?.includes("login.success")) {
      return "text-amber bg-amber-dim/30 border-amber/30";
    }
    if (eventid?.includes("command.input")) {
      return "text-brass-light bg-brass-dim/30 border-brass/30";
    }
    return "text-slate-text bg-surface-hover border-border-subtle";
  }

  return (
    <div className="flex-1 overflow-y-auto max-h-[390px] divide-y divide-border-subtle pr-1 font-mono text-xs">
      <AnimatePresence initial={false}>
        {events.map((evt, idx) => {
          const key = evt.timestamp ? `${evt.timestamp}-${idx}` : idx;
          let borderAccent = "";
          if (evt.eventid?.includes("login.failed")) borderAccent = "border-l-2 border-l-carmine/50";
          else if (evt.eventid?.includes("login.success")) borderAccent = "border-l-2 border-l-amber/50";
          else if (evt.eventid?.includes("command.input")) borderAccent = "border-l-2 border-l-brass/40";

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`py-2.5 px-2 flex items-start space-x-3 hover:bg-surface-hover/40 transition-colors duration-300 ${borderAccent}`}
            >
              <span className="text-[11px] text-slate-muted whitespace-nowrap pt-0.5">
                {formatTime(evt.timestamp)}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 border whitespace-nowrap uppercase tracking-wider ${getEventBadge(
                  evt.eventid
                )}`}
              >
                {getEventLabel(evt.eventid)}
              </span>
              <span className="text-[11px] text-ivory-dim font-medium whitespace-nowrap">
                {evt.src_ip || "0.0.0.0"}
              </span>
              <div className="flex-1 text-[11px] text-slate-text truncate">
                {evt.username ? (
                  <span>
                    user: <strong className="text-ivory">{evt.username}</strong>
                    {evt.password && (
                      <span> pass: <strong className="text-brass-light">{evt.password}</strong></span>
                    )}
                  </span>
                ) : evt.message ? (
                  <span className="text-ivory-dim">{evt.message}</span>
                ) : (
                  <span>Session {evt.session?.slice(0, 8) || "N/A"}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
