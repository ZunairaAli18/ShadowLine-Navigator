import type { Metadata } from "next";
import { Suspense } from "react";

import { Navigator } from "@/components/navigator/Navigator";

const DESC = "Pick a lunar landing site and dates: see the Sun and Earth over the real skyline, power and comms windows, and a verdict.";

export const metadata: Metadata = {
  title: "Navigator",
  description: DESC,
  openGraph: { title: "Navigator · Shadowline", description: DESC },
};

function NavigatorFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6" aria-busy>
      <p className="eyebrow">Navigator</p>
      <div className="glass h-40 animate-pulse rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="glass aspect-[16/9] animate-pulse rounded-2xl" />
        <div className="glass h-64 animate-pulse rounded-2xl" />
      </div>
    </div>
  );
}

/** The navigator reads its state from the URL (useSearchParams), so it renders inside Suspense. */
export default function NavigatorPage() {
  return (
    <Suspense fallback={<NavigatorFallback />}>
      <Navigator />
    </Suspense>
  );
}
