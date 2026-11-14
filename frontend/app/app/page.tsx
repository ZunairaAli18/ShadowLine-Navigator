import type { Metadata } from "next";

import { Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Navigator" };

export default function NavigatorPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <SectionHeading
        eyebrow="Navigator"
        title="Plan a landing"
        description="Pick a site and a date range to see sunlight, Earth visibility and a verdict."
      />
      <Card className="mt-8 text-muted">Coming in the next chunk.</Card>
    </div>
  );
}
