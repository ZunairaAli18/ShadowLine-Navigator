import { HorizonSilhouette } from "@/components/HorizonSilhouette";
import { Button, Pill } from "@/components/ui";

export default function Home() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 pb-40 pt-20 sm:px-6 sm:pt-28">
        <p className="eyebrow mb-5">NASA Space Apps 2026 · CLPS Landing Site Navigator</p>
        <h1 className="max-w-3xl text-4xl sm:text-6xl">
          Where and when to land on the Moon.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          For any landing site and date, Shadowline tracks the Sun and Earth across the real lunar skyline and tells you
          when you&apos;ll have power and a direct line home.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/app" arrow>
            Open the navigator
          </Button>
          <Button href="/learn" variant="secondary">
            How it works
          </Button>
        </div>
        <div className="mt-10 flex flex-wrap gap-2">
          <Pill tone="sun">☀ Sunlight windows</Pill>
          <Pill tone="earth">◉ Earth visibility</Pill>
          <Pill tone="accent">▲ LOLA terrain horizons</Pill>
        </div>
      </div>
      <HorizonSilhouette className="absolute inset-x-0 bottom-0 h-40 sm:h-56" seed={11} />
    </section>
  );
}
