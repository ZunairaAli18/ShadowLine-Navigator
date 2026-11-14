"use client";

import { motion, useSpring } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";
import type { PointerEvent, ReactNode } from "react";

import { Button } from "@/components/ui";

const PULL = 0.25; // fraction of the pointer offset
const MAX = 10; // px

/** Primary CTA that drifts toward the pointer and glows on hover. Plain Button under reduced motion. */
export function MagneticButton({ href, children }: { href: string; children: ReactNode }) {
  const reduced = useReducedMotionPref();
  const x = useSpring(0, { stiffness: 250, damping: 18 });
  const y = useSpring(0, { stiffness: 250, damping: 18 });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * PULL;
    const dy = (e.clientY - (r.top + r.height / 2)) * PULL;
    x.set(Math.max(-MAX, Math.min(MAX, dx)));
    y.set(Math.max(-MAX, Math.min(MAX, dy)));
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={reduced ? undefined : { x, y }}
      className="inline-block rounded-full transition-shadow duration-300 hover:shadow-[0_0_32px_-4px] hover:shadow-accent-deep/70"
    >
      <Button href={href} arrow>
        {children}
      </Button>
    </motion.div>
  );
}
