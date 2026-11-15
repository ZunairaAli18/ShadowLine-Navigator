import { Reveal } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import { Card } from "@/components/ui";

const REASONS = [
  {
    icon: "❄",
    title: "Water ice",
    body: "Some craters near the pole are so deep that sunlight never reaches their floors. They stay colder than −200 °C and can trap ice for billions of years. Ice means drinking water, air and rocket fuel.",
  },
  {
    icon: "◈",
    title: "Science",
    body: "The pole holds ancient, untouched rock and ice that record the Moon's history, and the solar system's, in a way the well-explored equator can't.",
  },
  {
    icon: "▲",
    title: "Artemis",
    body: "NASA's Artemis programme plans to land astronauts near the south pole and eventually build a base there. Robotic landers go first to scout.",
  },
];

export function WhyGo() {
  return (
    <ul className="mt-10 grid gap-4 md:grid-cols-3">
      {REASONS.map((r, i) => (
        <Reveal as="li" key={r.title} delay={i * 0.08}>
          <TiltCard>
            <Card className="h-full space-y-3">
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full border border-accent/40 text-lg text-accent">
                {r.icon}
              </span>
              <h3 className="text-xl">{r.title}</h3>
              <p className="text-muted">{r.body}</p>
            </Card>
          </TiltCard>
        </Reveal>
      ))}
    </ul>
  );
}
