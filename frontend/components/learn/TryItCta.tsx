"use client";

import { HorizonLayers } from "@/components/fx/HorizonLayers";
import { Button } from "@/components/ui";
import { encodeScenarios, presetEquatorVsPole } from "@/lib/compareUrl";
import { navigatorUrl } from "@/lib/format";
import { useNowHour } from "@/lib/useNowHour";

/** Final call to action. The compare link preloads "Equator vs pole" for the next 14 days. */
export function TryItCta() {
  const now = useNowHour();
  const cmpHref = now
    ? `/app?${new URLSearchParams({ site: "apollo-11", tab: "compare", cmp: encodeScenarios(presetEquatorVsPole({ start: now, days: 14 })) }).toString()}`
    : "/app?site=apollo-11&tab=compare";

  return (
    <section id="try" aria-labelledby="try-h" className="relative mt-10 scroll-mt-24 overflow-hidden">
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-56 pt-16 text-center sm:px-6 sm:pb-64">
        <p className="eyebrow mb-4">Try it yourself</p>
        <h2 id="try-h" className="text-4xl sm:text-5xl">
          Now plan a landing.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-muted">Everything on this page comes from the same model the navigator uses.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={cmpHref} arrow>
            Compare Apollo 11 and the south pole
          </Button>
          <Button href={navigatorUrl({ site: "im-2", tab: "best" })} variant="secondary" arrow>
            Find the best landing dates for IM-2
          </Button>
        </div>
      </div>
      <HorizonLayers sky className="absolute inset-0" />
    </section>
  );
}
