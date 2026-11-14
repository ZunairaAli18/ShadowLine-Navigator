import { HorizonSilhouette } from "@/components/HorizonSilhouette";
import { HeroSky } from "@/components/landing/HeroSky";
import { LiveConditions } from "@/components/landing/LiveConditions";
import { SiteCards } from "@/components/landing/SiteCards";
import { Button, Card, SectionHeading } from "@/components/ui";
import { navigatorUrl } from "@/lib/format";

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

const STEPS = [
  { title: "Pick a site and a date", body: "Choose a curated landing site or drop a pin anywhere on the Moon." },
  { title: "See the Sun and Earth against the real skyline", body: "We trace both across the sky and check them against the terrain around you." },
  { title: "Get power, comms and a verdict", body: "Sunlight and Earth-contact time, the longest dark spell, and a plain answer." },
];

const STATS = [
  { value: "0.04″", label: "Max difference from JPL Horizons for Sun and Earth positions" },
  { value: "360°", label: "Terrain horizon from NASA LOLA elevation data for every site" },
  { value: "11", label: "Curated landing sites, from Apollo 11 to the south pole" },
];

const CREDITS: { name: string; what: string; href?: string }[] = [
  { name: "LOLA elevation data", what: "NASA GSFC Planetary Geodesy Data Archive (PGDA)", href: "https://pgda.gsfc.nasa.gov/" },
  { name: "JPL Horizons and DE421 ephemeris", what: "NASA JPL Solar System Dynamics", href: "https://ssd.jpl.nasa.gov/horizons/" },
  { name: "LROC QuickMap", what: "site coordinates checked here", href: "https://quickmap.lroc.asu.edu/" },
  { name: "Moon Trek", what: "NASA Solar System Treks", href: "https://trek.nasa.gov/moon/" },
  { name: "CSA Moon Exploration", what: "Canadian Space Agency" },
];

export default function Home() {
  return (
    <>
      {/* 1. Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="relative z-10 mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
          <p className="eyebrow mb-5">NASA Space Apps 2026 · Lunar landing sites</p>
          <h1 id="hero-title" className="max-w-3xl text-5xl sm:text-7xl">
            Find where the light is.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Compare lunar landing sites by sunlight and Earth contact, using real terrain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/app" arrow>
              Open the navigator
            </Button>
            <Button href="/learn" variant="secondary">
              Why it&apos;s hard
            </Button>
          </div>
        </div>
        <HeroSky className="-mt-4 sm:-mt-24 lg:-mt-40" />
      </section>

      {/* 2. The south pole problem */}
      <section aria-labelledby="problem-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Why it matters" title={<span id="problem-title">The south pole problem</span>} />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <li key={p.title}>
              <Card className="h-full space-y-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center rounded-full border border-accent/40 text-accent"
                >
                  {p.icon}
                </span>
                <h3 className="text-xl">{p.title}</h3>
                <p className="text-muted">{p.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Landing sites */}
      <section aria-labelledby="sites-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Explore" title={<span id="sites-title">Landing sites</span>} viewAllHref="/app" />
        <div className="mt-10">
          <SiteCards />
        </div>
      </section>

      {/* 4. Live conditions */}
      <section aria-labelledby="live-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Live from the model"
          title={<span id="live-title">Conditions this lunar day</span>}
        />
        <div className="mt-10">
          <LiveConditions />
        </div>
      </section>

      {/* 5. How it works */}
      <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Three steps" title={<span id="how-title">How it works</span>} />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full space-y-3">
                <span className="font-heading text-4xl font-bold text-accent/80" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="text-muted">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* 6. Built on NASA data */}
      <section aria-labelledby="data-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Accuracy" title={<span id="data-title">Built on NASA data</span>} />
        <dl className="mt-10 grid gap-4 md:grid-cols-3">
          {STATS.map((s) => (
            <Card key={s.value} className="space-y-2">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-heading text-5xl font-bold tracking-tight">{s.value}</dd>
              <dd className="text-sm text-muted">{s.label}</dd>
            </Card>
          ))}
        </dl>
        <div className="mt-8">
          <h3 className="eyebrow mb-4">Data and tools</h3>
          <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {CREDITS.map((c) => (
              <li key={c.name} className="text-muted">
                {c.href ? (
                  <a href={c.href} target="_blank" rel="noreferrer" className="inline-block py-1 font-semibold text-text hover:text-accent">
                    {c.name}
                  </a>
                ) : (
                  <span className="font-semibold text-text">{c.name}</span>
                )}{" "}
                · {c.what}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. Final CTA */}
      <section aria-labelledby="cta-title" className="relative mt-10 overflow-hidden">
        <div className="relative z-10 mx-auto max-w-3xl px-4 pb-48 pt-16 text-center sm:px-6 sm:pb-56">
          <p className="eyebrow mb-4">Plan · Compare · Land</p>
          <h2 id="cta-title" className="text-4xl sm:text-5xl">
            Plan your next landing.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted">Launch slipped? Find the next good landing window in seconds.</p>
          <div className="mt-8">
            <Button href={navigatorUrl({ site: "im-2", tab: "best" })} arrow>
              Find the best dates
            </Button>
          </div>
        </div>
        <HorizonSilhouette className="absolute inset-x-0 bottom-0 h-40 sm:h-52" seed={23} roughness={0.8} />
      </section>
    </>
  );
}
