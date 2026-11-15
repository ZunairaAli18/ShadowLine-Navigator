"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { useReducedMotionPref } from "@/lib/useCapable";

/** Shows/hides content with a fade + height animation (instant under reduced motion). */
export function Collapse({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  const reduced = useReducedMotionPref();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="c"
          className={`overflow-hidden ${className ?? ""}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
