import React from "react";

export function Panel({
  title,
  subtitle,
  children,
  badge,
  className = "",
  action,
}) {
  return (
    <div
      className={`bg-surface border border-border-subtle flex flex-col overflow-hidden ${className}`}
    >
      <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-baseline space-x-2.5">
          <h2 className="text-[13px] font-medium text-ivory tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <span className="text-[11px] text-slate-muted hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {badge && <div>{badge}</div>}
          {action && <div>{action}</div>}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
