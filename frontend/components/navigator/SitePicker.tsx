"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { Pill } from "@/components/ui";
import { getSites, type Region, type Site } from "@/lib/api";
import { formatLatLon, latLonPlain, regionLabel } from "@/lib/format";
import { normalizeLon, validLat, type Location } from "@/lib/navState";

const REGION_ORDER: Region[] = ["south_pole", "south_polar", "equatorial", "far_side", "north_polar", "north_pole"];
const CUSTOM = "__custom__";

type Props = {
  value: Location;
  onChange: (loc: Location) => void;
  /** Decimals in the coordinates chip (Expert mode: 4). The dropdown always uses 2. */
  precision?: number;
};

/** Small chip with the selected coordinates; click copies "lat, lon" (east-positive decimals). */
function CoordsChip({ lat, lon, precision }: { lat: number; lon: number; precision: number }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);
  const text = formatLatLon(lat, lon, precision);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(latLonPlain(lat, lon)).then(
          () => setCopied(true),
          () => {},
        );
      }}
      title={`Copy "${latLonPlain(lat, lon)}"`}
      aria-label={`Coordinates ${text}. Copy as decimal latitude, longitude`}
      className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 font-mono text-[11px] text-lunar-300 transition-colors hover:border-accent/50 hover:text-text"
    >
      {copied ? <span className="text-good">✓ Copied</span> : text}
      <span aria-hidden className="text-lunar-500">⧉</span>
    </button>
  );
}

/** Curated sites grouped by region, plus "Custom coordinates" with validated lat/lon. */
export function SitePicker({ value, onChange, precision = 2 }: Props) {
  const id = useId();
  const [sites, setSites] = useState<Site[]>([]);
  const [customOpen, setCustomOpen] = useState(value.kind === "custom");
  const [lat, setLat] = useState(value.kind === "custom" ? String(value.lat) : "");
  const [lon, setLon] = useState(value.kind === "custom" ? String(value.lon) : "");

  useEffect(() => {
    const ctrl = new AbortController();
    getSites(undefined, { signal: ctrl.signal })
      .then((r) => setSites(r.sites))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const groups = useMemo(
    () =>
      REGION_ORDER.map((region) => ({ region, sites: sites.filter((s) => s.region === region) })).filter(
        (g) => g.sites.length,
      ),
    [sites],
  );

  const selected = value.kind === "site" ? sites.find((s) => s.id === value.siteId) : undefined;
  const selectValue = customOpen ? CUSTOM : value.kind === "site" ? value.siteId : CUSTOM;

  const latNum = Number(lat);
  const lonNum = Number(lon);
  const latErr = lat.trim() === "" ? "Required" : !validLat(latNum) ? "Latitude must be −90 to 90" : null;
  const lonErr =
    lon.trim() === "" ? "Required" : normalizeLon(lonNum) === null ? "Longitude must be −180 to 180 or 0 to 360" : null;

  const applyCustom = () => {
    if (latErr || lonErr) return;
    onChange({ kind: "custom", lat: latNum, lon: normalizeLon(lonNum)! });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={`${id}-site`} className="hud">
        Landing site
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`${id}-site`}
          value={selectValue}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            onChange({ kind: "site", siteId: e.target.value });
          }}
          className="min-w-0 max-w-full flex-1 rounded-lg border border-border bg-surface-solid px-3 py-2 text-sm text-text sm:min-w-56"
        >
          {value.kind === "site" && !selected && sites.length === 0 && <option value={value.siteId}>Loading sites…</option>}
          {groups.map((g) => (
            <optgroup key={g.region} label={regionLabel(g.region)}>
              {g.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {/* Native <option>s can't be styled per part, so the coordinates are plain text. The selected
                      option shows just the name (the closed select would cut the coordinates off; the chip next
                      to it shows them). */}
                  {s.id === selectValue ? s.name : `${s.name} · ${formatLatLon(s.lat, s.lon)}`}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM}>Custom coordinates…</option>
        </select>
        {selected && !customOpen && <Pill>{regionLabel(selected.region)}</Pill>}
        {(customOpen || value.kind === "custom") && <Pill tone="accent">Custom</Pill>}
        {selected && !customOpen && <CoordsChip lat={selected.lat} lon={selected.lon} precision={precision} />}
        {value.kind === "custom" && !customOpen && <CoordsChip lat={value.lat} lon={value.lon} precision={precision} />}
      </div>

      {customOpen && (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-lat`} className="sr-only">
              Latitude
            </label>
            <input
              id={`${id}-lat`}
              inputMode="decimal"
              placeholder="Lat (−90…90)"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              aria-invalid={!!latErr && lat !== ""}
              aria-describedby={`${id}-lat-err`}
              className="w-32 rounded-lg border border-border bg-surface-solid px-3 py-2 font-mono text-sm"
            />
            {lat !== "" && latErr && (
              <span id={`${id}-lat-err`} className="text-xs text-notviable">
                {latErr}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-lon`} className="sr-only">
              Longitude (east-positive)
            </label>
            <input
              id={`${id}-lon`}
              inputMode="decimal"
              placeholder="Lon (E+, ±180 or 0…360)"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              aria-invalid={!!lonErr && lon !== ""}
              aria-describedby={`${id}-lon-err`}
              className="w-44 rounded-lg border border-border bg-surface-solid px-3 py-2 font-mono text-sm"
            />
            {lon !== "" && lonErr && (
              <span id={`${id}-lon-err`} className="text-xs text-notviable">
                {lonErr}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!!latErr || !!lonErr}
            className="rounded-lg border border-accent/50 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Go
          </button>
        </form>
      )}
    </div>
  );
}
