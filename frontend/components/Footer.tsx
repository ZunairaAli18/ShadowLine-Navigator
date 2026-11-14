import Link from "next/link";

import { GITHUB_URL } from "@/components/Header";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-bg">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-3">
        <div className="space-y-2">
          <p className="font-heading text-base font-bold">Shadowline</p>
          <p className="text-muted">Lunar landing site navigator: sunlight and Earth contact, checked against real terrain.</p>
        </div>
        <nav aria-label="Footer" className="space-y-2">
          <p className="eyebrow">Explore</p>
          <ul className="space-y-0.5 text-muted">
            <li>
              <Link href="/app" className="inline-block py-1 hover:text-text">
                Navigator
              </Link>
            </li>
            <li>
              <Link href="/learn" className="inline-block py-1 hover:text-text">
                How it works
              </Link>
            </li>
            <li>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-block py-1 hover:text-text">
                Source on GitHub <span aria-hidden>↗</span>
              </a>
            </li>
          </ul>
        </nav>
        <div className="space-y-2">
          <p className="eyebrow">Data</p>
          <p className="text-muted">
            Terrain: NASA LRO LOLA (GSFC PGDA). Ephemeris: JPL DE421 via Skyfield, validated against JPL Horizons.
            Coordinates checked in LROC QuickMap.
          </p>
          <p className="text-muted">
            3D Moon textures: NASA Scientific Visualization Studio, CGI Moon Kit (LRO LROC/LOLA data, credit
            NASA/GSFC/Arizona State University).
          </p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl border-t border-border/40 px-4 py-6 text-xs text-muted/80 sm:px-6">
        A NASA Space Apps Challenge 2026 project by team Shadowline. Not an official NASA product.
      </p>
    </footer>
  );
}
