"use client";

import { motion, useScroll, useTransform } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";
import { useRef } from "react";

type Props = {
  text: string;
  className?: string;
  /** Parallax distance in px over the element's scroll range (positive = moves down slower). */
  drift?: number;
};

/** Giant outlined decorative word behind content, drifting slower than the page. Decorative only. */
export function OutlineText({ text, className = "", drift = 120 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-drift / 2, drift / 2]);

  return (
    <div ref={ref} aria-hidden className={`pointer-events-none select-none ${className}`}>
      <motion.span
        style={reduced ? undefined : { y }}
        className="block whitespace-nowrap font-heading font-bold leading-none tracking-tight text-transparent [-webkit-text-stroke:1px_var(--color-lunar-700)]"
      >
        {text}
      </motion.span>
    </div>
  );
}
