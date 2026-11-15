"use client";

import { useSyncExternalStore } from "react";

import { isApiWaking, subscribeApiWaking } from "@/lib/api";

/** Plain-language status for loading states while the free backend instance boots. */
export const WAKING_TEXT = "Waking up the model… (can take up to a minute)";

/** True while the backend seems to be waking (slow first answer or retrying). False on the server. */
export function useApiWaking(): boolean {
  return useSyncExternalStore(subscribeApiWaking, isApiWaking, () => false);
}
