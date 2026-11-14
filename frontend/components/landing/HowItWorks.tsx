"use client";

import { motion } from "motion/react";

import { Reveal } from "@/components/fx/Reveal";
import { Card, SectionHeading } from "@/components/ui";
import { useReducedMotionPref } from "@/lib/useCapable";

const STEPS = [
  { title: "Pick a site and a date", body: "Choose a curated landing site or drop a pin anywhere on the Moon." },
  { title: "See the Sun and Earth against the real skyline", body: "We trace both across the sky and check them against the terrain around you." },
  { title: "Get power, comms and a verdict", body: "Sunlight and Earth-contact time, the longest dark spell, and a plain answer." },
];

/** Three steps joined by a line that draws itself when the section scrolls into view. */
export function HowItWorks() {
  const reduced = useReducedMotionPref();
  const draw = {
    initial: { pathLength: reduced ? 1 : 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: reduced ? 0 : 1.6, ease: [0.65, 0, 0.35, 1] as const },
  };

  return (
    <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading eyebrow="Three steps" title={<span id="how-title">How it works</span>} />
      <div className="relative mt-12">
        {/* connector: horizontal on md+, vertical on mobile (decorative) */}
        <svg aria-hidden className="absolute left-0 right-0 top-7 hidden h-2 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 2">
          <motion.path d="M 16 1 L 84 1" stroke="var(--color-accent)" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="0" fill="none" {...draw} />
        </svg>
        <svg aria-hidden className="absolute bottom-10 left-7 top-10 w-2 md:hidden" preserveAspectRatio="none" viewBox="0 0 2 100">
          <motion.path d="M 1 0 L 1 100" stroke="var(--color-accent)" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" {...draw} />
        </svg>
        <ol className="relative grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={0.2 + i * 0.25}>
              <div className="flex gap-5 md:flex-col">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent/50 bg-bg font-mono text-sm text-accent shadow-[0_0_24px_-6px] shadow-accent-deep/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Card className="flex-1 space-y-2">
                  <h3 className="text-xl">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="text-muted">{s.body}</p>
                </Card>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
