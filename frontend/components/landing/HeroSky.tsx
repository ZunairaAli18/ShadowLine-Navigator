import { mulberry32, ridgePoints, toPath } from "@/components/HorizonSilhouette";

/**
 * Hero illustration (our own SVG): stars, a lunar ridge across the bottom, the Sun skimming the ridge
 * on the right and a small Earth low above the horizon on the left. Slow drift; off with reduced motion.
 */

const W = 1200;
const H = 560;
const RIDGE_TOP = 340; // ridge box occupies y = RIDGE_TOP..H
const SUN_X = 930;
const EARTH_X = 250;

const ridge = ridgePoints(4, 0.85, W, H - RIDGE_TOP, 64).map(([x, y]) => [x, y + RIDGE_TOP] as [number, number]);
const ridgeLine = toPath(ridge);

function ridgeYAt(x: number): number {
  const i = Math.min(ridge.length - 2, Math.max(0, Math.floor((x / W) * (ridge.length - 1))));
  const [x0, y0] = ridge[i];
  const [x1, y1] = ridge[i + 1];
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

const SUN_Y = ridgeYAt(SUN_X) + 6; // center just below the ridge: the disk peeks over it
const EARTH_Y = ridgeYAt(EARTH_X) - 70;

const rand = mulberry32(2026);
const STARS = Array.from({ length: 150 }, () => ({
  x: rand() * W,
  y: rand() * (RIDGE_TOP + 40),
  r: rand() < 0.88 ? 0.6 + rand() * 0.6 : 1.3 + rand() * 0.6,
  o: 0.25 + rand() * 0.6,
  layer: rand() < 0.5 ? 0 : 1,
}));

export function HeroSky({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`block h-auto w-full ${className}`}
      role="img"
      aria-label="Illustration: the Sun skimming a jagged lunar ridge, with a small Earth low above the horizon."
    >
      <defs>
        <radialGradient id="hero-sun-glow">
          <stop offset="0%" stopColor="var(--color-sun)" stopOpacity="0.55" />
          <stop offset="35%" stopColor="var(--color-sun)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-sun)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hero-earth" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#bfe9ff" />
          <stop offset="55%" stopColor="var(--color-earth)" />
          <stop offset="100%" stopColor="#1d5f8a" />
        </radialGradient>
        <linearGradient id="hero-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1e36" />
          <stop offset="100%" stopColor="var(--color-bg)" />
        </linearGradient>
        <linearGradient id="hero-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.15" />
          <stop offset="70%" stopColor="var(--color-sun)" stopOpacity="0.55" />
          <stop offset="85%" stopColor="var(--color-sun)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* stars, two slowly drifting layers */}
      {[0, 1].map((layer) => (
        <g key={layer} className={layer === 0 ? "motion-safe:animate-drift" : "motion-safe:animate-drift-slow"}>
          {STARS.filter((s) => s.layer === layer).map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="var(--color-text)" opacity={s.o} />
          ))}
        </g>
      ))}

      {/* Earth: small, low over the horizon, partly lit */}
      <g>
        <circle cx={EARTH_X} cy={EARTH_Y} r={30} fill="var(--color-earth)" opacity={0.08} />
        <circle cx={EARTH_X} cy={EARTH_Y} r={15} fill="url(#hero-earth)" />
        <path
          d={`M${EARTH_X},${EARTH_Y - 15} A15,15 0 0 1 ${EARTH_X},${EARTH_Y + 15} A8,15 0 0 0 ${EARTH_X},${EARTH_Y - 15}Z`}
          fill="var(--color-bg)"
          opacity={0.55}
        />
      </g>

      {/* Sun glow + disk, behind the ridge */}
      <g className="motion-safe:animate-glow" style={{ transformOrigin: `${SUN_X}px ${SUN_Y}px` }}>
        <circle cx={SUN_X} cy={SUN_Y} r={170} fill="url(#hero-sun-glow)" />
      </g>
      <circle cx={SUN_X} cy={SUN_Y} r={13} fill="#fff4dc" />

      {/* ground */}
      <path d={`${ridgeLine} L${W},${H} L0,${H} Z`} fill="url(#hero-ground)" />
      <path d={ridgeLine} fill="none" stroke="url(#hero-rim)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
