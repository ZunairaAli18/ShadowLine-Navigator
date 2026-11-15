import type { Metadata } from "next";

import { HorizonSilhouette } from "@/components/HorizonSilhouette";
import { Button, Card, Pill, SectionHeading, VerdictBadge } from "@/components/ui";

import { SiteCount } from "./SiteCount";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

const COLORS = [
  ["bg", "#0B0D1A"],
  ["surface", "#141729"],
  ["border", "#2A2E4A"],
  ["accent", "#B9A6FF"],
  ["accent-deep", "#7C5CFF"],
  ["text", "#F4F2FF"],
  ["muted", "#A7A9C4"],
  ["sun", "#FFC56B"],
  ["earth", "#5EC8FF"],
  ["good", "#5BD69A"],
  ["risky", "#FFB454"],
  ["notviable", "#FF6B7A"],
] as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm uppercase tracking-[0.2em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-14 sm:px-6">
      <SectionHeading
        eyebrow="Design system"
        title="Shadowline styleguide"
        description="Every token and base component in one place, to check the look."
      />

      <Block title="API check">
        <Card>
          <SiteCount />
        </Card>
      </Block>

      <Block title="Colors">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COLORS.map(([name, hex]) => (
            <div key={name} className="overflow-hidden rounded-xl border border-border">
              <div className="h-16" style={{ background: `var(--color-${name})` }} />
              <div className="bg-surface px-3 py-2 text-xs">
                <p className="font-semibold">{name}</p>
                <p className="text-muted">{hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Typography">
        <Card className="space-y-4">
          <p className="eyebrow">Eyebrow label</p>
          <h1 className="text-5xl">Sora heading, bold and tight</h1>
          <h2 className="text-3xl">Second-level heading</h2>
          <h3 className="text-xl">Third-level heading</h3>
          <p className="max-w-2xl">
            Inter body text. At the lunar south pole the Sun never rises more than about 1.5° above the horizon, so a
            single ridge can decide whether a lander has power.
          </p>
          <p className="text-muted">Muted text for secondary information.</p>
        </Card>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button arrow>Primary with arrow</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost" arrow>
            Ghost
          </Button>
          <Button href="/app" arrow>
            Link button
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Block>

      <Block title="Pills and verdict badges">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>South pole</Pill>
          <Pill tone="accent">LOLA terrain</Pill>
          <Pill tone="sun">☀ Sun 82%</Pill>
          <Pill tone="earth">◉ Earth 64%</Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict="good" />
          <VerdictBadge verdict="risky" />
          <VerdictBadge verdict="not_viable" />
        </div>
      </Block>

      <Block title="Section heading">
        <SectionHeading
          eyebrow="Curated sites"
          title="Where missions have landed"
          description="Optional description line under the title."
          viewAllHref="/app"
        />
      </Block>

      <Block title="Cards">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: "Shackleton Connecting Ridge", region: "south_pole", verdict: "risky" as const, sun: 100, earth: 42 },
            { name: "Apollo 11", region: "equatorial", verdict: "good" as const, sun: 100, earth: 100 },
            { name: "Chang'e 4", region: "far_side", verdict: "not_viable" as const, sun: 92, earth: 0 },
          ].map((s) => (
            <Card key={s.name} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg">{s.name}</h3>
                <VerdictBadge verdict={s.verdict} />
              </div>
              <Pill>{s.region.replace("_", " ")}</Pill>
              <p className="text-sm text-muted">
                <span className="text-sun">Sun {s.sun}%</span> · <span className="text-earth">Earth {s.earth}%</span>
              </p>
            </Card>
          ))}
        </div>
      </Block>

      <Block title="Horizon silhouette">
        <Card className="overflow-hidden p-0">
          <div className="relative h-48">
            <div className="absolute left-[70%] top-10 h-6 w-6 rounded-full bg-sun shadow-[0_0_40px_10px] shadow-sun/30" />
            <div className="absolute left-[20%] top-6 h-4 w-4 rounded-full bg-earth shadow-[0_0_24px_6px] shadow-earth/30" />
            <HorizonSilhouette className="absolute inset-x-0 bottom-0 h-28" seed={3} />
          </div>
        </Card>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 5, 9].map((seed) => (
            <Card key={seed} className="overflow-hidden p-0">
              <HorizonSilhouette className="h-20" seed={seed} glow={seed !== 9} />
              <p className="px-3 py-2 text-xs text-muted">seed={seed}</p>
            </Card>
          ))}
        </div>
      </Block>
    </div>
  );
}
