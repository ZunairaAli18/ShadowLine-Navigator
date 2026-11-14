"use client";

import { animate, useInView } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";
import { useEffect, useRef } from "react";

type Props = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
};

/**
 * Counts up from 0 when it enters view. The final value is always in the accessible text;
 * the animated digits are aria-hidden. Reduced motion: shows the final value immediately.
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 1.4, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotionPref();
  const final = `${prefix}${value.toFixed(decimals)}${suffix}`;

  useEffect(() => {
    const el = numRef.current;
    if (!el || !inView || reduced) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, reduced, value, decimals, prefix, suffix, duration]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{final}</span>
      <span ref={numRef} aria-hidden className="tabular-nums">
        {reduced ? final : `${prefix}${(0).toFixed(decimals)}${suffix}`}
      </span>
    </span>
  );
}
