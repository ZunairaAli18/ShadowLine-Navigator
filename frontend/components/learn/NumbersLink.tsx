import Link from "next/link";

/** Small "See the numbers →" link that opens the navigator in Expert mode for a site (and window). */
export function NumbersLink({ site, start, days, label = "See the numbers" }: { site: string; start?: Date | null; days?: number; label?: string }) {
  const q = new URLSearchParams({ site, mode: "expert" });
  if (start) q.set("start", start.toISOString().replace(/\.\d{3}Z$/, "Z"));
  if (days) q.set("days", String(days));
  return (
    <Link href={`/app?${q.toString()}`} className="inline-flex min-h-8 items-center gap-1 rounded-full font-mono text-[11px] uppercase tracking-[0.15em] text-accent hover:text-text">
      {label} <span aria-hidden>→</span>
    </Link>
  );
}
