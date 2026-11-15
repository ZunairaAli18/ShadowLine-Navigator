"use client";

import { useEffect, useState } from "react";

export type DotSection = { id: string; label: string };

/** Sticky section dots on the side (desktop only). Highlights the section in view. */
export function SectionDots({ sections }: { sections: DotSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Guide sections" className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 xl:block">
      <ol className="flex flex-col gap-1">
        {sections.map((s, i) => {
          const on = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                className="group flex min-h-7 items-center justify-end gap-3"
              >
                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-opacity ${on ? "text-accent opacity-100" : "text-lunar-500 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
                  {String(i + 1).padStart(2, "0")} {s.label}
                </span>
                <span aria-hidden className={`block rounded-full transition-all ${on ? "h-2.5 w-2.5 bg-accent" : "h-1.5 w-1.5 bg-lunar-600 group-hover:bg-lunar-300"}`} />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
