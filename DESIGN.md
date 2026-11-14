# Shadowline: Design Direction

Read this before building or changing any frontend UI. It overrides any earlier, simpler theme notes.

## The feel
Cinematic, immersive, alive. Think "mission control meets a space documentary": a real 3D Moon,
light that moves, depth and parallax, precise HUD details. Nothing should feel like a static template.
Motion always explains something (light moving, Earth bobbing, shadows sweeping), never decoration alone.

Inspiration (use the ideas, never copy their images or layouts exactly):
- Observatory site: deep purple/navy night sky, huge bold headlines, lavender pill buttons, rounded
  bordered cards, dark landscape silhouette on the horizon.
- "MOON" site: monochrome lunar greys, a huge photoreal Moon overlapping the frame edges, giant
  OUTLINED background text behind the content, layered depth, glassy info bar, "NEXT" style navigation.
- "SPACED" site: minimal black, a huge half-cropped Moon on the right, thin uppercase wide-tracked
  type, HUD tick ruler on the left edge, thin-bordered buttons with corner ticks, vertical text.

## Palette
Mostly black and lunar greys, with lavender as the single accent, plus semantic Sun/Earth colours.

| Token | Value | Use |
|---|---|---|
| bg | #07080F | page background (near black) |
| bg-2 | #0B0D1A | alternate sections |
| surface | rgba(20,23,41,0.55) | glass panels (with backdrop blur) |
| surface-solid | #141729 | cards where blur isn't needed |
| border | rgba(185,166,255,0.14) | hairline borders |
| lunar-100..900 | #F2F2F4 → #1A1B22 | greys for Moon imagery, outline text, HUD |
| accent | #B9A6FF | buttons, links, eyebrows, focus |
| accent-deep | #7C5CFF | hover, glows |
| text | #F4F2FF | headings/body |
| muted | #A7A9C4 | secondary text |
| sun | #FFC56B | Sun, sunlight bands, warm glow |
| earth | #5EC8FF | Earth, Earth-visible bands |
| good / risky / notviable | #5BD69A / #FFB454 / #FF6B7A | verdicts (always with text + icon) |

Subtle purple nebula gradients are allowed in hero/background layers only.

## Typography
- Display headlines: Sora 700, very large (clamp up to ~8rem), tight leading (0.95).
- Outline text: giant decorative words (e.g. "SOUTH POLE", "SHADOWLINE") drawn with a 1px lunar-500
  stroke and transparent fill, behind content, moving slower on scroll (parallax).
- Labels / nav / eyebrows / HUD: uppercase, letter-spacing 0.3em, small, Inter or a mono font
  (JetBrains Mono) for numbers and coordinates.
- Body: Inter.

## Signature elements
1. **Live 3D Moon** (React Three Fiber): NASA CGI Moon Kit colour + displacement textures, lit by the
   REAL Sun direction for the current/selected time (so the day/night line is true). Slow rotation,
   drag to rotate, site markers that glow. Often half-cropped off the right edge of the screen.
2. **Starfield with depth**: 2-3 parallax layers; reacts slightly to mouse movement and scroll.
3. **Horizon silhouettes**: jagged lunar ridges layered at different depths at section bottoms.
4. **HUD details**: tick ruler on the left edge, live coordinate readouts (lat/lon, Sun az/el), corner-tick
   frames around key panels, thin crosshair markers, vertical side text.
5. **Glass panels**: translucent surface + backdrop blur + hairline border for overlays and metrics.
6. **Sun glow**: soft bloom around the Sun (postprocessing bloom in 3D, radial gradient in 2D).

## Motion system
Libraries: `motion` (Framer Motion) for component/page motion, GSAP + ScrollTrigger for scroll-driven
scenes, Lenis for smooth scrolling, @react-three/fiber + drei (+ postprocessing) for 3D.

- Page load: headline letters/lines rise and fade in with a stagger; the Moon fades and scales in.
- Scroll storytelling (landing): camera travels from the full Moon down to the south pole; the Sun
  lowers to skim the horizon; outline text drifts slower than foreground (parallax).
- Section reveals: fade + 24px rise, or a clip-path mask wipe for headlines. Stagger cards.
- Numbers: count up when they enter view (stats, percentages).
- Hover: buttons get a soft accent glow and a small arrow nudge; cards tilt slightly (max 6 deg) with
  a light sheen; magnetic effect on primary CTAs.
- Data changes (navigator): Sun/Earth markers glide to new positions (no jumps); verdict badges
  cross-fade; site changes trigger a short camera fly-to on the globe.
- Timeline play: smooth 60fps scrubbing, driven by already-loaded data (no network per frame).
- Durations 200-700ms for UI, eased (easeOut / custom cubic-bezier). Scroll scenes are scrubbed.

## Imagery (all public domain or credited, never the inspiration images)
- NASA SVS "CGI Moon Kit" colour + displacement maps for the 3D Moon.
- NASA image library (Apollo photos, Earthrise-style views) and LROC images
  (credit: NASA/GSFC/Arizona State University).
- Our own SVG: horizon silhouettes, sky plots, HUD.
- Credit every image in the footer. No NASA logo or anything implying NASA endorsement.

## Performance and accessibility (non-negotiable)
- Lazy-load all 3D (dynamic import, no SSR). Show a static Moon image placeholder until ready.
- Cap device pixel ratio at 2; lower texture size and disable bloom on mobile/low-power devices.
- `prefers-reduced-motion`: no scroll-jacking, no parallax, no auto-rotation; simple fades only.
- Keep text readable over imagery (gradient scrims). WCAG AA contrast for text.
- Colour is never the only signal (verdicts and visibility always have text/icons).
- Target 60fps on a mid laptop; pause 3D rendering when off-screen or the tab is hidden.
