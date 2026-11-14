import type { Metadata } from "next";

import { Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <SectionHeading
        eyebrow="Learn"
        title="How lunar lighting works"
        description="Why the south pole is different, what a terrain horizon is, and how to read the results."
      />
      <Card className="mt-8 text-muted">Coming in a later chunk.</Card>
    </div>
  );
}
