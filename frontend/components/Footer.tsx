import Link from "next/link";

import { GITHUB_URL } from "@/components/Header";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-heading font-semibold text-text">Shadowline</span> · NASA Space Apps Challenge 2026 ·
          Lunar Landing Site Navigator
        </p>
        <p className="flex gap-4">
          <Link href="/learn" className="hover:text-text">
            How it works
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-text">
            Source on GitHub
          </a>
        </p>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted/70 sm:px-6">
        Ephemeris: JPL DE421 via Skyfield, validated against JPL Horizons. Terrain: NASA LRO LOLA elevation maps.
      </p>
    </footer>
  );
}
