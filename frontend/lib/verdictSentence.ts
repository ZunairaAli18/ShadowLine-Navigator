/**
 * Friendly explanation of a verdict (Simple mode "Why?"): one short lead sentence with the main reason, plus
 * any other reasons as short bullet points. Built from the metric numbers with the same thresholds as
 * backend/app/core/metrics.py (pure, unit-tested).
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

type M = Pick<Metrics, "verdict" | "sun_pct" | "earth_pct" | "longest_dark_hours" | "longest_dark_truncated">;

/** Main reason first; `more` holds the other reasons (may be empty). */
export type VerdictExplanation = { lead: string; more: string[] };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Reasons in order of importance; the first becomes the lead sentence, the rest become bullets. */
function explain(prefix: string, reasons: string[], fallback: string): VerdictExplanation {
  const [main = fallback, ...rest] = reasons;
  return { lead: `${prefix} ${main}.`, more: rest.map(cap) };
}

export function verdictSentence(m: M): VerdictExplanation {
  const sun = Math.round(m.sun_pct);
  const earth = Math.round(m.earth_pct);
  const dark = `${m.longest_dark_truncated ? "at least " : ""}${plainDuration(m.longest_dark_hours)}`;

  if (m.verdict === "not_viable") {
    const why: string[] = [];
    if (m.earth_pct === 0) why.push("Earth never rises above the skyline, so the lander would need a relay satellite to talk home");
    if (m.sun_pct < NOT_VIABLE_MIN_SUN) why.push(`the Sun is up only ${sun}% of the time`);
    if (m.longest_dark_hours > NOT_VIABLE_MAX_DARK_H) why.push(`the longest darkness is ${dark}, too long for batteries`);
    return explain("Not viable because", why, "conditions are too harsh");
  }

  if (m.verdict === "risky") {
    const why: string[] = [];
    if (m.earth_pct < GOOD_MIN_EARTH) why.push(`Earth is in view only ${earth}% of the time, so contact would be patchy`);
    if (m.sun_pct < GOOD_MIN_SUN) why.push(`the Sun is up only ${sun}% of the time`);
    if (m.longest_dark_hours > GOOD_MAX_DARK_H) why.push(`the longest darkness is ${dark}`);
    return explain("Risky because", why, "some conditions are borderline");
  }

  return {
    lead: `Good: the Sun is up ${sun}% of the time.`,
    more: [`Earth is in view ${earth}% of the time`, m.longest_dark_hours === 0 ? "It never gets dark" : `The longest dark spell is only ${dark}`],
  };
}
