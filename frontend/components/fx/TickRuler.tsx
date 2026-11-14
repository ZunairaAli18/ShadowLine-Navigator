/** Vertical HUD tick ruler for the left edge (decorative). */
export function TickRuler({ className = "", label = "LAT" }: { className?: string; label?: string }) {
  const ticks = Array.from({ length: 41 }, (_, i) => i);
  return (
    <div aria-hidden className={`pointer-events-none flex flex-col items-start ${className}`}>
      <span className="hud mb-3 [writing-mode:vertical-rl]">{label}</span>
      <svg width="28" height="400" viewBox="0 0 28 400" className="text-lunar-700">
        {ticks.map((i) => {
          const major = i % 10 === 0;
          const mid = i % 5 === 0;
          return (
            <line
              key={i}
              x1={0}
              x2={major ? 22 : mid ? 14 : 8}
              y1={i * 10}
              y2={i * 10}
              stroke="currentColor"
              strokeWidth={major ? 1.2 : 0.8}
            />
          );
        })}
        {[0, 10, 20, 30, 40].map((i) => (
          <text key={i} x={24} y={i * 10 + 3} fontSize={7} fill="currentColor" className="font-mono">
            {90 - i * 4.5}
          </text>
        ))}
      </svg>
    </div>
  );
}
