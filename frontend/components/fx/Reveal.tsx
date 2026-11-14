"use client";

import { motion } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Seconds; use index * 0.08 to stagger siblings. */
  delay?: number;
  as?: "div" | "li";
};

/** Fade + 24px rise when scrolled into view (once). Reduced motion: fade only. */
export function Reveal({ children, className, delay = 0, as = "div" }: Props) {
  const reduced = useReducedMotionPref();
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: reduced ? 0.3 : 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}
