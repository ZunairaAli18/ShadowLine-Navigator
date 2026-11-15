import { ImageResponse } from "next/og";

/** Social preview card (1200x630), drawn from our own shapes: no photos, no NASA logo. Built at build time. */
export const alt = "Shadowline: Lunar Landing Site Navigator. Sunlight and Earth contact windows on real lunar terrain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RIDGE = "M0 470 L90 420 L160 445 L250 380 L330 430 L420 395 L520 450 L610 400 L700 430 L790 360 L880 420 L960 390 L1050 440 L1130 405 L1200 425";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "radial-gradient(circle at 80% 20%, #1f1640 0%, #0B0D1A 45%, #07080F 100%)",
          color: "#F4F2FF",
          fontFamily: "sans-serif",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d={`${RIDGE} L1200 630 L0 630 Z`} fill="#141729" />
          <path d={RIDGE} fill="none" stroke="#B9A6FF" strokeWidth="4" strokeLinejoin="round" />
          {/* Crescent Moon: lit limb of one disc minus an offset disc (the "shadow line") */}
          <path d="M903.3,74.6 A150,150 0 1,0 1046.7,325.4 A150,150 0 0,1 903.3,74.6 Z" fill="#E7E6EE" />
          {/* Low Sun skimming the ridge, Earth on the horizon */}
          <circle cx="700" cy="398" r="26" fill="#FFC56B" fillOpacity="0.18" />
          <circle cx="700" cy="398" r="10" fill="#FFC56B" />
          <circle cx="1150" cy="372" r="9" fill="#5EC8FF" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", padding: "70px 80px", gap: 18 }}>
          <div style={{ fontSize: 22, letterSpacing: 8, color: "#B9A6FF", textTransform: "uppercase" }}>Lunar landing site navigator</div>
          <div style={{ fontSize: 108, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>Shadowline</div>
          <div style={{ fontSize: 34, color: "#A7A9C4", maxWidth: 700, lineHeight: 1.3 }}>
            Where and when to land on the Moon: sunlight and Earth contact, checked against real terrain.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
