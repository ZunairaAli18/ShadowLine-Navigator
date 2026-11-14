import type { HTMLAttributes } from "react";

/** Rounded surface panel with a thin border. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`rounded-2xl border border-border bg-surface p-5 ${className}`} />;
}
