import React from "react";
import { motion } from "framer-motion";

export function Panel({
  title,
  subtitle,
  children,
  badge,
  className = "",
  delay = 0,
  action,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 1, 0.5, 1] }}
      className={`bg-surface border border-border-subtle rounded-none flex flex-col overflow-hidden ${className}`}
    >
      <div className="relative px-5 py-3.5 border-b border-border-subtle flex items-center justify-between bg-surface/50">
        <div className="absolute top-0 left-0 w-4 h-[1px] bg-brass-dark" />
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-brass rounded-none rotate-45 opacity-80" />
          <div>
            <h2 className="font-serif text-[17px] tracking-wide text-ivory font-normal leading-none">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] font-sans text-slate-text tracking-widest uppercase mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {badge && <div>{badge}</div>}
          {action && <div>{action}</div>}
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col overflow-hidden relative">
        {children}
      </div>
    </motion.div>
  );
}
