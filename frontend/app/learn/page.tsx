import type { Metadata } from "next";
import Link from "next/link";

import { MaskReveal } from "@/components/fx/MaskReveal";
import { OutlineText } from "@/components/fx/OutlineText";
import { Reveal } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import { EarthBob } from "@/components/learn/EarthBob";
import { FlatVsTerrain } from "@/components/learn/FlatVsTerrain";
import { Glossary } from "@/components/learn/Glossary";
import { SectionDots } from "@/components/learn/SectionDots";
import { SunBehindHill } from "@/components/learn/SunBehindHill";
import { SunNeverHigh } from "@/components/learn/SunNeverHigh";
import { TryItCta } from "@/components/learn/TryItCta";
import { WhyGo } from "@/components/learn/WhyGo";
import { Card, Pill } from "@/components/ui";

export const metadata: Metadata = {
  title: "Learn",
  description: "Why is the Moon's south pole so hard? Sunlight, Earth and shadows on the Moon, explained in three minutes.",
};

const SECTIONS = [
  { id: "why", label: "Why go" },
  { id: "sun", label: "Low Sun" },
  { id: "hills", label: "Hills" },
  { id: "earth", label: "Earth" },
  { id: "missions", label: "Missions" },
  { id: "terrain", label: "Terrain" },
  { id: "glossary", label: "Glossary" },
  { id: "try", label: "Try it" },
];

function Section({ id, eyebrow, title, children, intro }: { id: string; eyebrow: string; title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h2 id={`${id}-h`} className="text-3xl sm:text-4xl">
        {title}
      </h2>
      {intro && <div className="mt-4 max-w-2xl text-muted">{intro}</div>}
      {children}
    </section>
  );
}

const MISSIONS = [
  {
    title: "IM-2 Athena",
    year: "2025 · South pole",
    body: "Landed on Mons Mouton but came to rest on its side in a cold, shadowed crater. Its solar panels caught too little light, and it ran out of power within about a day.",
    href: "/app?site=im-2",
    link: "See IM-2 in the navigator",
    tone: "text-sun",
    lesson: "Lost to the shadows",
  },
  {
    title: "Chang'e 4",
    year: "2019 · Far side",
    body: "Landed inside Von Kármán crater on the far side, where Earth is never in the sky. Every message had to bounce through a relay satellite parked beyond the Moon.",
    href: "/app?site=change-4",
    link: "See Chang'e 4",
    tone: "text-earth",
    lesson: "Out of Earth's sight",
  },
];

export default function LearnPage() {
  return (
    <>
      <SectionDots sections={SECTIONS} />

      {/* 1. Header */}
      <header className="relative overflow-hidden">
        <OutlineText text="SOUTH POLE" className="absolute -left-[2vw] top-[30%] text-[19vw] opacity-60" />
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-10 pt-20 sm:px-6 sm:pt-28">
          <p className="eyebrow mb-5">Learn · 3-minute guide</p>
          <MaskReveal as="h1" lines={["Why is the Moon's", "south pole so hard?"]} className="display max-w-5xl !text-[clamp(2.6rem,7vw,6rem)]" />
          <p className="mt-6 max-w-xl text-lg text-muted">Sunlight, Earth and shadows on the Moon, explained.</p>
        </div>
      </header>

      {/* 2 */}
      <Section id="why" eyebrow="01 · Why go there?" title="The most interesting place on the Moon">
        <WhyGo />
      </Section>

      {/* 3 */}
      <Section
        id="sun"
        eyebrow="02 · The Sun never rises high"
        title="Same Sun, two very different skies"
        intro="At the equator the Sun climbs high. At the south pole it circles the horizon, never more than about 2° up. Both plots below are live for the next 14 days."
      >
        <SunNeverHigh />
      </Section>

      {/* 4 */}
      <Section
        id="hills"
        eyebrow="03 · Hills block the Sun"
        title="A small hill, a long night"
        intro="A hill just 3° high can hide a low Sun for days. Drag the Sun down and watch the lander's power."
      >
        <SunBehindHill />
      </Section>

      {/* 5 */}
      <Section
        id="earth"
        eyebrow="04 · Earth bobs at the horizon"
        title="Earth comes and goes"
        intro="The Moon wobbles slightly as it orbits, so Earth drifts up and down in its sky. At the south pole that's enough to take Earth below the skyline. This is real data for Shackleton ridge over the next 30 days."
      >
        <EarthBob />
      </Section>

      {/* 6 */}
      <Section id="missions" eyebrow="05 · Real missions" title="What happens when the light runs out">
        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {MISSIONS.map((m, i) => (
            <Reveal as="li" key={m.title} delay={i * 0.1}>
              <TiltCard>
                <Card className="flex h-full flex-col gap-4 p-7">
                  <Pill tone="accent">{m.year}</Pill>
                  <div>
                    <h3 className="text-3xl">{m.title}</h3>
                    <p className={`mt-1 font-heading text-lg ${m.tone}`}>{m.lesson}</p>
                  </div>
                  <p className="flex-1 text-muted">{m.body}</p>
                  <Link href={m.href} className="inline-flex min-h-10 items-center gap-1 self-start rounded-full text-sm font-semibold text-accent hover:text-text">
                    {m.link} <span aria-hidden>→</span>
                  </Link>
                </Card>
              </TiltCard>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* 7 */}
      <Section
        id="terrain"
        eyebrow="06 · Small changes, big difference"
        title="Flat ground gives the wrong answer"
        intro="Assuming flat ground gives the wrong answer. Real terrain changes what the lander can see."
      >
        <FlatVsTerrain />
      </Section>

      {/* 8 */}
      <Section id="glossary" eyebrow="07 · Glossary" title="Words worth knowing">
        <Glossary />
      </Section>

      {/* 9 */}
      <TryItCta />
    </>
  );
}
