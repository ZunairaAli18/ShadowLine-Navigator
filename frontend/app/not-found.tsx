import type { Metadata } from "next";
import { HorizonSilhouette } from "@/components/HorizonSilhouette";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Lost in the shadows" };

/** Friendly 404: a site that fell into a permanently shadowed crater. Static, no motion needed. */
export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-[70vh] items-center overflow-hidden">
      <p
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 select-none text-center font-heading text-[clamp(8rem,30vw,22rem)] font-extrabold leading-none text-transparent [-webkit-text-stroke:1px_var(--color-lunar-700)]"
      >
        404
      </p>
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="eyebrow mb-4">Signal lost · 404</p>
        <h1 className="display text-5xl sm:text-7xl">Lost in the shadows</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          This page sits in a permanently shadowed crater: no sunlight, no line of sight to Earth. Let&rsquo;s get you back
          into the light.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button href="/app" arrow>
            Open the navigator
          </Button>
          <Button href="/" variant="secondary">
            Back to the home page
          </Button>
          <Button href="/learn" variant="ghost">
            Learn the basics
          </Button>
        </div>
        <p className="hud mt-10 text-lunar-500">Sun · below the skyline &nbsp;·&nbsp; Earth · out of view</p>
      </div>
      <HorizonSilhouette className="absolute inset-x-0 bottom-0 -z-10 h-28 w-full" seed={404} glow />
    </section>
  );
}
