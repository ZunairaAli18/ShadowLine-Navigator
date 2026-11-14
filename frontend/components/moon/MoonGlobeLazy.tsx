"use client";

import dynamic from "next/dynamic";

/** Lazy, client-only MoonGlobe (three.js never ships in the initial bundle or runs on the server). */
export const MoonGlobeLazy = dynamic(() => import("./MoonGlobe"), { ssr: false, loading: () => null });
export type { GlobeSite } from "./MoonGlobe";
