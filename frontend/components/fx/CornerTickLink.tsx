import Link from "next/link";
import type { ReactNode } from "react";

/** Thin-bordered, uppercase link with small corner ticks (HUD style). */
export function CornerTickLink({ href, children }: { href: string; children: ReactNode }) {
  const tick = "pointer-events-none absolute h-2 w-2 border-accent transition-all duration-300";
  return (
    <Link
      href={href}
      className="group relative inline-flex items-center gap-2 border border-border px-5 py-2.5 font-mono text-xs uppercase tracking-[0.3em] text-text transition-colors hover:border-accent/40 hover:text-accent"
    >
      <span aria-hidden className={`${tick} -left-px -top-px border-l border-t group-hover:-left-1 group-hover:-top-1`} />
      <span aria-hidden className={`${tick} -right-px -top-px border-r border-t group-hover:-right-1 group-hover:-top-1`} />
      <span aria-hidden className={`${tick} -bottom-px -left-px border-b border-l group-hover:-bottom-1 group-hover:-left-1`} />
      <span aria-hidden className={`${tick} -bottom-px -right-px border-b border-r group-hover:-bottom-1 group-hover:-right-1`} />
      {children}
    </Link>
  );
}
