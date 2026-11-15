const TERMS: { term: string; def: string }[] = [
  { term: "Azimuth", def: "Compass direction of something in the sky, in degrees: 0° north, 90° east, 180° south, 270° west." },
  { term: "Elevation", def: "How high something is above the flat horizon, in degrees. 0° is the horizon, 90° is straight overhead." },
  { term: "Horizon", def: "The line where the sky meets the ground. On a perfectly flat, smooth Moon it would sit at 0° all the way round." },
  { term: "Terrain horizon", def: "The real skyline made by hills, ridges and crater rims. We compute it from NASA's LOLA laser maps of the Moon's surface." },
  { term: "Libration", def: "A slight wobble of the Moon as it orbits. From the surface it makes Earth drift up and down a few degrees in the sky." },
  { term: "Lunar day", def: "One sunrise to the next on the Moon: about 29.5 Earth days, so roughly two weeks of light and two weeks of night near the equator." },
  { term: "Permanently shadowed region", def: "Ground, usually a deep polar crater floor, that never gets direct sunlight. These are the cold traps that can hold water ice." },
  { term: "Direct-to-Earth communication", def: "Talking to Earth with a radio pointed straight at it. It only works while Earth is above the lander's skyline." },
];

/** Plain-English glossary as an accessible accordion (native <details>). */
export function Glossary() {
  return (
    <ul className="mt-10 grid gap-3 md:grid-cols-2">
      {TERMS.map((t) => (
        <li key={t.term}>
        <details className="glass group rounded-xl px-4 open:pb-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-heading font-semibold [&::-webkit-details-marker]:hidden">
            <span>{t.term}</span>
            <span aria-hidden className="text-accent transition-transform group-open:rotate-45 motion-reduce:transition-none">
              +
            </span>
          </summary>
          <p className="text-sm text-muted">{t.def}</p>
        </details>
        </li>
      ))}
    </ul>
  );
}
