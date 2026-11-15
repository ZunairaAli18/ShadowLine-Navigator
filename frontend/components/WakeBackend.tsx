"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import { wakeBackend } from "@/lib/api";
import { useApiWaking, WAKING_TEXT } from "@/lib/useApiWaking";
import { useReducedMotionPref } from "@/lib/useCapable";

/**
 * Pings GET /health as soon as any page loads (so a sleeping backend starts booting early) and shows a
 * small glass notice while requests are waiting on a cold start.
 */
export function WakeBackend() {
  const waking = useApiWaking();
  const reduced = useReducedMotionPref();

  useEffect(() => {
    wakeBackend();
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {waking && (
          <motion.p
            key="waking"
            role="status"
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 12 }}
            transition={{ duration: reduced ? 0 : 0.3 }}
            className="glass flex items-center gap-3 rounded-full px-4 py-2 text-sm text-text"
          >
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
            {WAKING_TEXT}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
