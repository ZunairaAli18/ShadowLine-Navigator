import { describe, expect, it } from "vitest";

import { formatLatLon, latLonPlain } from "./format";

describe("formatLatLon", () => {
  it("uses 2 decimals with N/S and E/W", () => {
    expect(formatLatLon(0.674, 23.473)).toBe("0.67°N 23.47°E");
    expect(formatLatLon(-84.7906, 29.1957)).toBe("84.79°S 29.20°E");
    expect(formatLatLon(-89.45, -137.3)).toBe("89.45°S 137.30°W");
  });

  it("supports 4 decimals (Expert)", () => {
    expect(formatLatLon(-84.7906, 29.1957, 4)).toBe("84.7906°S 29.1957°E");
  });

  it("normalizes 0..360 longitudes and never shows a negative zero", () => {
    expect(formatLatLon(10, 200)).toBe("10.00°N 160.00°W");
    expect(formatLatLon(10, 180)).toBe("10.00°N 180.00°E");
    expect(formatLatLon(-0.001, -0.002)).toBe("0.00°N 0.00°E");
  });

  it("copies plain east-positive decimals", () => {
    expect(latLonPlain(-84.7906, 29.1957)).toBe("-84.7906, 29.1957");
  });
});
