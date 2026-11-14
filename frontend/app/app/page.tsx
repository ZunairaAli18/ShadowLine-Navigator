import type { Metadata } from "next";
import { Suspense } from "react";

import { Navigator } from "@/components/navigator/Navigator";

export const metadata: Metadata = { title: "Navigator" };

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
