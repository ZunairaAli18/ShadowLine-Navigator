"use client";

import { motion, useScroll, useTransform } from "motion/react";

import { useReducedMotionPref } from "@/lib/useCapable";
import { useRef } from "react";

import { HorizonSilhouette } from "@/components/HorizonSilhouette";

type Props = {
  className?: string;
  /** Show a low Sun glow and a small Earth above the ridges. */
  sky?: boolean;
};

const LAYERS = [
  { seed: 31, roughness: 0.55, opacity: 0.45, drift: 70, h: "h-32 sm:h-44", glow: false },
  { seed: 17, roughness: 0.7, opacity: 0.7, drift: 40, h: "h-28 sm:h-40", glow: false },
  { seed: 5, roughness: 0.8, opacity: 1, drift: 0, h: "h-24 sm:h-36", glow: true },
];

/** Jagged ridges layered at different depths; far layers drift more on scroll. Reduced motion: static. */
/** Positioning comes from className (e.g. "absolute inset-0"); defaults to "relative". */
export function HorizonLayers({ className = "relative", sky = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y0 = useTransform(scrollYProgress, [0, 1], [LAYERS[0].drift, -LAYERS[0].drift]);
  const y1 = useTransform(scrollYProgress, [0, 1], [LAYERS[1].drift, -LAYERS[1].drift]);
  const ys = [y0, y1, null];

  return (
    <div ref={ref} aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      {sky && (
        <>
          <div className="absolute bottom-[18%] right-[18%] h-64 w-64 translate-x-1/2 translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_197_107/0.45),rgb(255_197_107/0.12)_35%,transparent_70%)]" />
          <div className="absolute bottom-[22%] right-[18%] h-3 w-3 translate-x-1/2 rounded-full bg-[#fff4dc] shadow-[0_0_24px_8px_rgb(255_197_107/0.5)]" />
          <div className="absolute bottom-[42%] left-[16%] h-4 w-4 rounded-full bg-[radial-gradient(circle_at_35%_35%,#bfe9ff,var(--color-earth)_55%,#1d5f8a)] shadow-[0_0_18px_4px_rgb(94_200_255/0.25)]" />
        </>
      )}
      {LAYERS.map((l, i) => {
        const y = ys[i];
        return (
          <motion.div
            key={l.seed}
            style={reduced || !y ? { opacity: l.opacity } : { y, opacity: l.opacity }}
            className="absolute inset-x-0 bottom-0"
          >
            <HorizonSilhouette className={l.h} seed={l.seed} roughness={l.roughness} glow={l.glow} />
          </motion.div>
        );
      })}
    </div>
  );
}
