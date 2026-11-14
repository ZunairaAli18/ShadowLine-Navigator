import type { Verdict } from "@/lib/api";

const STYLES: Record<Verdict, { label: string; cls: string; icon: string }> = {
  good: { label: "Good", cls: "border-good/40 bg-good/10 text-good", icon: "✓" },
  risky: { label: "Risky", cls: "border-risky/40 bg-risky/10 text-risky", icon: "!" },
  not_viable: { label: "Not viable", cls: "border-notviable/40 bg-notviable/10 text-notviable", icon: "✕" },
};

/** Verdict shown with color AND text (and an icon), so it doesn't rely on color alone. */
export function VerdictBadge({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  const s = STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls} ${className}`}
    >
      <span aria-hidden className="text-[0.7rem] leading-none">
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}
