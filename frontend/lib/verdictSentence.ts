/**
 * One friendly sentence explaining a verdict (Simple mode "Why?"), built from the metric numbers with the
 * same thresholds as backend/app/core/metrics.py (pure, unit-tested).
 */

import type { Metrics } from "./api";

const NOT_VIABLE_MIN_SUN = 20;
const NOT_VIABLE_MAX_DARK_H = 120;
const GOOD_MIN_SUN = 70;
const GOOD_MIN_EARTH = 70;
const GOOD_MAX_DARK_H = 48;

export function plainDuration(hours: number): string {
  if (hours >= 48) {
    const d = Math.round(hours / 24);
    return `${d} days`;
  }
  const h = Math.round(hours);
  return h === 1 ? "1 hour" : `${h} hours`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

type M = Pick<Metrics, "verdict" | "sun_pct" | "earth_pct" | "longest_dark_hours" | "longest_dark_truncated">;

export function verdictSentence(m: M): string {
  const sun = Math.round(m.sun_pct);
  const earth = Math.round(m.earth_pct);
  const dark = `${m.longest_dark_truncated ? "at least " : ""}${plainDuration(m.longest_dark_hours)}`;

  if (m.verdict === "not_viable") {
    const why: string[] = [];
    if (m.earth_pct === 0) why.push("Earth never rises above the skyline here, so the lander would need a relay satellite to talk home");
    if (m.sun_pct < NOT_VIABLE_MIN_SUN) why.push(`the Sun is up only ${sun}% of the time`);
    if (m.longest_dark_hours > NOT_VIABLE_MAX_DARK_H) why.push(`the longest darkness is ${dark}, too long for batteries`);
    return `Not viable because ${joinAnd(why) || "conditions are too harsh"}.`;
  }

  if (m.verdict === "risky") {
    const why: string[] = [];
    if (m.sun_pct < GOOD_MIN_SUN) why.push(`the Sun is up only ${sun}% of the time`);
    if (m.earth_pct < GOOD_MIN_EARTH) why.push(`Earth is in view only ${earth}% of the time, so contact would be patchy`);
    if (m.longest_dark_hours > GOOD_MAX_DARK_H) why.push(`the longest darkness is ${dark}`);
    return `Risky because ${joinAnd(why) || "some conditions are borderline"}.`;
  }

  const darkPart = m.longest_dark_hours === 0 ? "it never gets dark" : `the longest dark spell is only ${dark}`;
  return `Good: the Sun is up ${sun}% of the time, Earth is in view ${earth}% of the time and ${darkPart}.`;
}
