import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LiveFeed({ events = [] }) {
  if (!events || events.length === 0) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-slate-muted font-mono text-xs">
        <span>WAITING FOR HONEYPOT TELEMETRY...</span>
        <span className="text-[10px] mt-1 text-slate-dim">
          Click a simulation button above or connect to SSH port 2222
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

  function getEventConfig(eventid) {
    if (eventid?.includes("login.failed")) {
      return {
        label: "✗ AUTH FAIL",
        badge: "text-carmine-light bg-carmine-dim/40 border-carmine/40",
        rowBorder: "border-l-2 border-l-carmine",
      };
    }
    if (eventid?.includes("login.success")) {
      return {
        label: "✓ LOGIN OK",
        badge: "text-emerald-light bg-emerald-dim/40 border-emerald/40",
        rowBorder: "border-l-2 border-l-emerald",
      };
    }
    if (eventid?.includes("command.input") || eventid?.includes("command.failed")) {
      return {
        label: "$ COMMAND",
        badge: "text-brass-light bg-brass-dim/40 border-brass/40",
        rowBorder: "border-l-2 border-l-brass",
      };
    }
    if (eventid?.includes("session.connect")) {
      return {
        label: "→ CONNECT",
        badge: "text-ivory-dim bg-surface-hover border-border-subtle",
        rowBorder: "border-l-2 border-l-slate-muted",
      };
    }
    return {
      label: "← CLOSED",
      badge: "text-slate-text bg-surface-hover border-border-subtle",
      rowBorder: "border-l-2 border-l-transparent",
    };
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-border-subtle pr-1 font-mono text-xs">
      <AnimatePresence initial={false}>
        {events.map((evt, idx) => {
          const key = evt.timestamp
            ? `${evt.session || ""}-${evt.timestamp}-${evt.eventid}-${idx}`
            : idx;
          const cfg = getEventConfig(evt.eventid);
          const isCmd = evt.eventid?.includes("command.");

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`py-2 px-2.5 flex items-center space-x-3 hover:bg-surface-hover/50 transition-colors duration-200 ${cfg.rowBorder}`}
            >
              <span className="text-[11px] text-slate-muted whitespace-nowrap tabular-nums">
                {formatTime(evt.timestamp)}
              </span>

              <span
                className={`text-[10px] w-24 text-center px-1.5 py-0.5 border whitespace-nowrap uppercase tracking-wider ${cfg.badge}`}
              >
                {cfg.label}
              </span>

              <span className="text-[11px] text-ivory-dim font-medium whitespace-nowrap tabular-nums">
                {evt.src_ip || "172.18.0.1"}
              </span>

              <div className="flex-1 text-[11px] text-slate-text truncate">
                {evt.username ? (
                  <span>
                    user: <strong className="text-ivory">{evt.username}</strong>
                    {evt.password && (
                      <span>
                        {" "}
                        · pass:{" "}
                        <strong
                          className={
                            evt.eventid?.includes("failed")
                              ? "text-carmine-light"
                              : "text-emerald-light"
                          }
                        >
                          {evt.password}
                        </strong>
                      </span>
                    )}
                  </span>
                ) : isCmd ? (
                  <span className="text-brass-light font-medium">
                    {evt.message?.startsWith("CMD: ")
                      ? `$ ${evt.message.slice(5)}`
                      : evt.message}
                  </span>
                ) : evt.message ? (
                  <span className="text-slate-text">{evt.message}</span>
                ) : (
                  <span>Session #{evt.session?.slice(0, 8) || "N/A"}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
