import type { ReactNode } from "react";

type Tone = "default" | "accent" | "sun" | "earth";

const TONES: Record<Tone, string> = {
  default: "border-border text-muted",
  accent: "border-accent/40 text-accent",
  sun: "border-sun/40 text-sun",
  earth: "border-earth/40 text-earth",
};

/** Small rounded tag, e.g. a region or "LOLA terrain". */
export function Pill({ children, tone = "default", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-bg/40 px-3 py-1 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
