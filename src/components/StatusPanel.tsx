import type { PropsWithChildren, ReactNode } from "react";

interface StatusPanelProps extends PropsWithChildren {
  tone?: "neutral" | "error";
  title: string;
  action?: ReactNode;
  live?: boolean;
}

export function StatusPanel({
  tone = "neutral",
  title,
  action,
  live = false,
  children,
}: StatusPanelProps) {
  return (
    <section
      className={`status-panel status-panel--${tone}`}
      aria-live={live ? "polite" : undefined}
    >
      <h2>{title}</h2>
      {children}
      {action ? <div className="status-panel__actions">{action}</div> : null}
    </section>
  );
}
