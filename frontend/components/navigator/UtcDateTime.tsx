"use client";

import { useId } from "react";

/** UTC date + time inputs (values are always UTC; the label says so). */
export function UtcDateTime({
  label,
  value,
  onChange,
  withTime = true,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  withTime?: boolean;
}) {
  const id = useId();
  const date = value.toISOString().slice(0, 10);
  const time = value.toISOString().slice(11, 16);
  const set = (d: string, t: string) => {
    const next = new Date(`${d}T${t || "00:00"}:00Z`);
    if (!Number.isNaN(next.getTime())) onChange(next);
  };
  return (
    <fieldset className="min-w-0">
      <legend className="hud mb-1.5">
        {label} <span className="text-accent">UTC</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-d`} className="sr-only">
          {label} date (UTC)
        </label>
        <input
          id={`${id}-d`}
          type="date"
          value={date}
          onChange={(e) => set(e.target.value, time)}
          className="min-w-0 rounded-lg border border-border bg-surface-solid px-2.5 py-1.5 font-mono text-sm [color-scheme:dark]"
        />
        {withTime && (
          <>
            <label htmlFor={`${id}-t`} className="sr-only">
              {label} time (UTC)
            </label>
            <input
              id={`${id}-t`}
              type="time"
              step={3600}
              value={time}
              onChange={(e) => set(date, e.target.value)}
              className="rounded-lg border border-border bg-surface-solid px-2.5 py-1.5 font-mono text-sm [color-scheme:dark]"
            />
          </>
        )}
      </div>
    </fieldset>
  );
}
