"use client";

import { useMemo, useSyncExternalStore } from "react";

/** Friendly Simple-mode hints, one at a time; dismissed ones are remembered so they don't repeat. */

const KEY = "shadowline.hints.dismissed";
const EVENT = "shadowline-hints";

export type HintId = "play" | "compare" | "map";
const HINTS: { id: HintId; text: string; action?: string }[] = [
  { id: "play", text: "Press ▶ on the timeline to watch the Sun move." },
  { id: "compare", text: "Try Compare → Flat vs real terrain to see why the skyline matters.", action: "Open Compare" },
  { id: "map", text: "Open the Moon map to see day and night across the whole Moon.", action: "Open Moon map" },
];

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function Hints({ onAction }: { onAction: (id: HintId) => void }) {
  const raw = useSyncExternalStore(subscribe, read, () => "ALL"); // server: show nothing
  const dismissed = useMemo<string[]>(() => {
    if (raw === "ALL") return HINTS.map((h) => h.id);
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [raw]);
  const hint = HINTS.find((h) => !dismissed.includes(h.id));
  if (!hint) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...dismissed, hint.id]));
    } catch {
      /* storage blocked: the hint simply comes back next visit */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div role="status" className="glass flex flex-wrap items-center gap-3 rounded-2xl border-accent/30 px-4 py-2.5 text-sm">
      <span aria-hidden className="text-accent">
        ✦
      </span>
      <span className="min-w-0 flex-1 text-text">{hint.text}</span>
      {hint.action && (
        <button
          type="button"
          onClick={() => {
            onAction(hint.id);
            dismiss();
          }}
          className="min-h-8 rounded-full border border-accent/50 px-3 text-xs font-semibold text-accent hover:bg-accent/10"
        >
          {hint.action}
        </button>
      )}
      <button type="button" onClick={dismiss} className="min-h-8 rounded-full px-3 text-xs text-muted hover:text-text" aria-label="Dismiss hint">
        Got it ✕
      </button>
    </div>
  );
}
