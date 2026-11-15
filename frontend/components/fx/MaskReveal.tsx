"use client";

import { motion } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";

type Props = {
  lines: string[];
  className?: string;
  as?: "h1" | "h2" | "p";
  id?: string;
  delay?: number;
};

/** Lines rise out of a mask with a stagger on mount. Reduced motion: a plain fade. Text stays real text. */
export function MaskReveal({ lines, className, as = "h1", id, delay = 0.1 }: Props) {
  const reduced = useReducedMotionPref();
  const Tag = as;
  return (
    <Tag id={id} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.14em]">
          <motion.span
            className="block"
            initial={reduced ? { opacity: 0 } : { y: "110%" }}
            animate={reduced ? { opacity: 1 } : { y: "0%" }}
            transition={{ duration: reduced ? 0.4 : 0.8, delay: delay + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
