import Link from "next/link";

import { Reveal } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import { Card, Pill, SectionHeading } from "@/components/ui";
import { navigatorUrl } from "@/lib/format";

const STORIES = [
  {
    site: "im-2",
    tag: "2025 · South pole",
    title: "IM-2 Athena",
    lesson: "Lost to the shadows",
    body: "Athena reached the Mons Mouton plateau in March 2025 but came to rest on its side in a cold, shadowed crater. With too little sunlight on its panels, it ran out of power within about a day.",
    metric: "~1 day of power",
    tone: "sun" as const,
  },
  {
    site: "change-4",
    tag: "2019 · Far side",
    title: "Chang'e 4",
    lesson: "Out of Earth's sight",
    body: "The first soft landing on the far side, inside Von Kármán crater. Earth never rises there, so every bit of data had to bounce through the Queqiao relay satellite.",
    metric: "0% Earth visibility",
    tone: "earth" as const,
  },
];

/** Two missions that show the two failure modes: no sunlight, no line to Earth. */
export function Stories() {
  return (
    <section aria-labelledby="stories-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading
        eyebrow="Lessons from the surface"
        title={<span id="stories-title">Light and line of sight</span>}
        description="Two landings that show what the navigator checks for."
      />
      <ul className="mt-10 grid gap-5 md:grid-cols-2">
        {STORIES.map((s, i) => (
          <Reveal as="li" key={s.site} delay={i * 0.1}>
            <TiltCard>
              <Link
                href={navigatorUrl({ site: s.site })}
                className="block h-full rounded-2xl"
                aria-label={`${s.title}: ${s.lesson}. Open in the navigator`}
              >
                <Card className="flex h-full flex-col gap-4 p-7 transition-colors hover:border-accent/40">
                  <div className="flex items-center justify-between gap-3">
                    <Pill tone="accent">{s.tag}</Pill>
                    <span className="hud">Case {String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <h3 className="text-3xl">{s.title}</h3>
                    <p className={`mt-1 font-heading text-lg ${s.tone === "sun" ? "text-sun" : "text-earth"}`}>{s.lesson}</p>
                  </div>
                  <p className="flex-1 text-muted">{s.body}</p>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="font-mono text-sm text-lunar-300">{s.metric}</span>
                    <span className="text-sm font-semibold text-accent">
                      Explore <span aria-hidden>→</span>
                    </span>
                  </div>
                </Card>
              </Link>
            </TiltCard>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
