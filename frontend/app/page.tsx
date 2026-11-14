import { CountUp } from "@/components/fx/CountUp";
import { HorizonLayers } from "@/components/fx/HorizonLayers";
import { MagneticButton } from "@/components/fx/MagneticButton";
import { OutlineText } from "@/components/fx/OutlineText";
import { Reveal } from "@/components/fx/Reveal";
import { SmoothScroll } from "@/components/fx/SmoothScroll";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveConditions } from "@/components/landing/LiveConditions";
import { SiteCards } from "@/components/landing/SiteCards";
import { SouthPole } from "@/components/landing/SouthPole";
import { Stories } from "@/components/landing/Stories";
import { Card, SectionHeading } from "@/components/ui";
import { navigatorUrl } from "@/lib/format";

const STATS = [
  { value: 0.04, decimals: 2, suffix: "″", label: "Max difference from JPL Horizons for Sun and Earth positions" },
  { value: 360, decimals: 0, suffix: "°", label: "Terrain horizon from NASA LOLA elevation data for every site" },
  { value: 11, decimals: 0, suffix: "", label: "Curated landing sites, from Apollo 11 to the south pole" },
];

const CREDITS: { name: string; what: string; href: string }[] = [
  { name: "LOLA elevation data", what: "NASA GSFC Planetary Geodesy Data Archive (PGDA)", href: "https://pgda.gsfc.nasa.gov/" },
  { name: "JPL Horizons and DE421 ephemeris", what: "NASA JPL Solar System Dynamics", href: "https://ssd.jpl.nasa.gov/horizons/" },
  { name: "CGI Moon Kit", what: "NASA SVS, 3D Moon textures", href: "https://svs.gsfc.nasa.gov/4720" },
  { name: "LROC QuickMap", what: "site coordinates checked here", href: "https://quickmap.lroc.asu.edu/" },
  { name: "Moon Trek", what: "NASA Solar System Treks", href: "https://trek.nasa.gov/moon/" },
  { name: "CSA Moon Exploration", what: "Canadian Space Agency", href: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" },
];

export default function Home() {
  return (
    <SmoothScroll>
      {/* 1. Hero (3D Moon on capable devices, HeroSky otherwise) */}
      <Hero />

      {/* 2. Down to the south pole (scroll scene) / the three problem cards */}
      <SouthPole />

      {/* 3. Stories */}
      <Stories />

      {/* 4. Landing sites */}
      <section aria-labelledby="sites-title" className="relative mx-auto max-w-6xl overflow-x-clip px-4 py-24 sm:px-6">
        <OutlineText text="SOUTH POLE" className="absolute -top-6 left-0 -z-10 text-[16vw] opacity-50 lg:text-[12rem]" drift={80} />
        <SectionHeading eyebrow="Explore" title={<span id="sites-title">Landing sites</span>} viewAllHref="/app" />
        <div className="mt-10">
          <SiteCards />
        </div>
      </section>

      {/* 5. Live conditions */}
      <section aria-labelledby="live-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Live from the model" title={<span id="live-title">Conditions this lunar day</span>} />
        <div className="mt-10">
          <LiveConditions />
        </div>
      </section>

      {/* 6. How it works */}
      <HowItWorks />

      {/* 7. Built on NASA data */}
      <section aria-labelledby="data-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Accuracy" title={<span id="data-title">Built on NASA data</span>} />
        <dl className="mt-10 grid gap-4 md:grid-cols-3">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <Card className="h-full space-y-2">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-heading text-5xl font-bold tracking-tight sm:text-6xl">
                  <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix} />
                </dd>
                <dd className="text-sm text-muted">{s.label}</dd>
              </Card>
            </Reveal>
          ))}
        </dl>
        <div className="mt-10">
          <h3 className="eyebrow mb-4">Data and tools</h3>
          <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {CREDITS.map((c) => (
              <li key={c.name} className="text-muted">
                <a href={c.href} target="_blank" rel="noreferrer" className="inline-block py-1 font-semibold text-text hover:text-accent">
                  {c.name}
                </a>{" "}
                · {c.what}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 8. Final CTA over layered horizons */}
      <section aria-labelledby="cta-title" className="relative mt-10 overflow-hidden">
        <div className="relative z-10 mx-auto max-w-3xl px-4 pb-56 pt-16 text-center sm:px-6 sm:pb-64">
          <p className="eyebrow mb-4">Plan · Compare · Land</p>
          <h2 id="cta-title" className="text-4xl sm:text-6xl">
            Plan your next landing.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted">Launch slipped? Find the next good landing window in seconds.</p>
          <div className="mt-8">
            <MagneticButton href={navigatorUrl({ site: "im-2", tab: "best" })}>Find the best dates</MagneticButton>
          </div>
        </div>
        <HorizonLayers sky className="absolute inset-0" />
      </section>
    </SmoothScroll>
  );
}
