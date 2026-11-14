"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";
import type { PointerEvent, ReactNode } from "react";

const MAX_TILT = 6; // degrees (DESIGN.md)

/** Tilts toward the pointer (max 6°) with a light sheen. Off for touch and reduced motion. */
export function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotionPref();
  const rx = useSpring(0, { stiffness: 200, damping: 20 });
  const ry = useSpring(0, { stiffness: 200, damping: 20 });
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const sheen = useMotionTemplate`radial-gradient(420px circle at ${mx}% ${my}%, rgb(185 166 255 / 0.12), transparent 45%)`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * MAX_TILT);
    rx.set(-(py - 0.5) * 2 * MAX_TILT);
    mx.set(px * 100);
    my.set(py * 100);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={`group/tilt relative h-full ${className}`}
    >
      {children}
      {!reduced && (
        <motion.div
          aria-hidden
          style={{ background: sheen }}
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
        />
      )}
    </motion.div>
  );
}
