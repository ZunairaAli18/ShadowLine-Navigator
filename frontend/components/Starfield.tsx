/** Fixed, subtle starfield behind every page (pure CSS, see the `starfield` utility in globals.css). */
export function Starfield() {
  return <div aria-hidden className="starfield pointer-events-none fixed inset-0 -z-10" />;
}
