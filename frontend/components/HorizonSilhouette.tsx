/**
 * Dark, jagged lunar horizon line (decorative). Deterministic for a given seed, so server and
 * client render the same path.
 */

type Props = {
  className?: string;
  /** Different seeds give different skylines. */
  seed?: number;
  /** 0..1, how tall the peaks are relative to the box. */
  roughness?: number;
  /** Draw a thin accent glow along the ridge line. */
  glow?: boolean;
};

const W = 1200;
const H = 200;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(seed: number, roughness: number): string {
  const rand = mulberry32(seed);
  const points: [number, number][] = [];
  const steps = 48;
  // Two broad "massifs" plus small jagged noise.
  const m1 = 0.2 + rand() * 0.25;
  const m2 = 0.6 + rand() * 0.3;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W;
    const u = i / steps;
    const massif =
      Math.exp(-(((u - m1) / 0.12) ** 2)) * 0.9 + Math.exp(-(((u - m2) / 0.18) ** 2)) * 0.6;
    const noise = (rand() - 0.5) * 0.35;
    const height = Math.max(0.05, 0.25 + massif * 0.55 + noise * 0.4) * roughness;
    points.push([x, H - height * H]);
  }
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function HorizonSilhouette({ className = "", seed = 7, roughness = 0.75, glow = true }: Props) {
  const line = ridge(seed, roughness);
  const gradId = `horizon-fade-${seed}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      className={`block w-full ${className}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1d33" />
          <stop offset="100%" stopColor="#07080f" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gradId})`} />
      {glow && (
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity={0.45}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
