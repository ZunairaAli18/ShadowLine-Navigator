"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";

import { HorizonLayers } from "@/components/fx/HorizonLayers";
import { Reveal } from "@/components/fx/Reveal";
import { MoonGlobeLazy } from "@/components/moon/MoonGlobeLazy";
import { Card, SectionHeading } from "@/components/ui";
import { getSnapshot } from "@/lib/api";
import { sunDirFromAzEl, type Vec3 } from "@/lib/sun";
import { useCapable } from "@/lib/useCapable";

gsap.registerPlugin(ScrollTrigger);

const PROBLEMS = [
  {
    icon: "❄",
    title: "Everyone's going south",
    body: "The south pole has water ice hiding in craters that never see sunlight. That's where the next landers are headed.",
  },
  {
    icon: "☀",
    title: "The Sun barely rises",
    body: "Near the pole the Sun circles the horizon at about 2 degrees. A small hill can block it for days.",
  },
  {
    icon: "!",
    title: "Small mistakes are fatal",
    body: "In 2025, IM-2 Athena tipped into a shadowed crater and ran out of power within about a day.",
  },
];

const STEPS = ["Everyone's going south.", "The Sun barely rises.", "A small hill can block it for days."];
const STEP_DETAIL = [
  "Water ice hides in polar craters that never see sunlight.",
  "At the pole it circles the horizon about 2° up, never overhead.",
  "So a lander's power depends on the skyline around it.",
];

/** Reduced motion / mobile / low power: the three cards. */
function ProblemCards() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading eyebrow="Why it matters" title={<span id="problem-title">The south pole problem</span>} />
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {PROBLEMS.map((p, i) => (
          <Reveal as="li" key={p.title} delay={i * 0.08}>
            <Card className="h-full space-y-3">
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full border border-accent/40 text-accent">
                {p.icon}
              </span>
              <h3 className="text-xl">{p.title}</h3>
              <p className="text-muted">{p.body}</p>
            </Card>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

/** Capable devices: pinned scene; scrolling flies the camera from the full Moon to the south pole. */
function DownToThePole() {
  const section = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const latRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [sunDir, setSunDir] = useState<Vec3>();

  useEffect(() => {
    const ctrl = new AbortController();
    getSnapshot({ lat: 0, lon: 0, time: new Date() }, { signal: ctrl.signal })
      .then((s) => setSunDir(sunDirFromAzEl(s.sun.az, s.sun.el)))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!section.current) return;
    const st = ScrollTrigger.create({
      trigger: section.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        progress.current = p;
        if (latRef.current) latRef.current.textContent = `${(-89.5 * Math.min(1, p / 0.85)).toFixed(1)}°`;
        if (endRef.current) endRef.current.style.opacity = String(Math.max(0, Math.min(1, (p - 0.8) / 0.15)));
        setStep(p < 0.3 ? 0 : p < 0.6 ? 1 : 2);
      },
    });
    return () => st.kill();
  }, []);

  return (
    <div ref={section} className="relative h-[340vh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <MoonGlobeLazy mode="fly" progressRef={progress} sunDir={sunDir} className="absolute inset-y-0 -right-[12%] w-[85%]" />
        {/* scrim so the steps stay readable over the lit surface */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[70%] bg-gradient-to-r from-bg via-bg/75 to-transparent" />

        {/* end of the descent: layered ridges with a low Sun and Earth */}
        <div ref={endRef} className="pointer-events-none absolute inset-0 opacity-0">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/40 to-bg" />
          <HorizonLayers sky className="absolute inset-x-0 bottom-0 h-[50%]" />
        </div>

        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-between px-4 py-24 sm:px-6 lg:px-12">
          <div>
            <p className="eyebrow mb-4">Why it matters</p>
            <h2 id="problem-title" className="text-4xl sm:text-5xl">
              Down to the south pole
            </h2>
          </div>
          <ol className="relative my-auto min-h-48 max-w-xl">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={`absolute inset-x-0 bottom-0 transition-all duration-700 ${
                  step === i ? "translate-y-0 opacity-100" : i < step ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0"
                }`}
              >
                <p className="hud mb-3">
                  Step {i + 1} / {STEPS.length}
                </p>
                <p className="font-heading text-3xl font-bold leading-tight sm:text-5xl">{s}</p>
                <p className="mt-3 text-muted">{STEP_DETAIL[i]}</p>
              </li>
            ))}
          </ol>
          <p className="hud">
            Latitude <span ref={latRef} className="text-lunar-200">0.0°</span> · scroll to descend
          </p>
        </div>
      </div>
    </div>
  );
}

export function SouthPole() {
  const capable = useCapable();
  return (
    <section aria-labelledby="problem-title" className="relative">
      {capable ? <DownToThePole /> : <ProblemCards />}
    </section>
  );
}
