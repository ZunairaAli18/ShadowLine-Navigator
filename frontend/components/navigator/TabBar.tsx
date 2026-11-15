"use client";

import { motion } from "motion/react";
import Link from "next/link";

import type { NavTab } from "@/lib/navState";
import { useReducedMotionPref } from "@/lib/useCapable";

type Props = { active: NavTab | null; onSelect: (tab: NavTab | null) => void };

const TABS: { id: "compare" | "best"; label: string; icon: string }[] = [
  { id: "compare", label: "Compare", icon: "⇆" },
  { id: "best", label: "Best dates", icon: "★" },
];

/** Compare · Best dates · Moon map (coming soon) · Learn (link). Animated underline on the active tab. */
export function TabBar({ active, onSelect }: Props) {
  const reduced = useReducedMotionPref();
  const base = "relative flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors";
  return (
    <nav aria-label="Navigator tools" className="glass flex flex-wrap items-center gap-1 rounded-2xl p-1.5">
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : t.id)}
            className={`${base} ${on ? "text-accent" : "text-muted hover:text-text"}`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
            {on && (
              <motion.span
                layoutId="tab-underline"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}
      <span className={`${base} cursor-not-allowed text-lunar-600`} aria-disabled="true" title="Coming soon">
        <span aria-hidden>◐</span> Moon map
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunar-600">soon</span>
      </span>
      <Link href="/learn" className={`${base} text-muted hover:text-text`}>
        <span aria-hidden>?</span> Learn <span aria-hidden>↗</span>
      </Link>
    </nav>
  );
}
