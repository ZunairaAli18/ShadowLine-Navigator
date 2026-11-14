import Link from "next/link";

export const GITHUB_URL = "https://github.com/ZunairaAli18/ShadowLine-Navigator";

const NAV = [
  { href: "/app", label: "Navigator" },
  { href: "/learn", label: "Learn" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-heading text-base font-bold tracking-tight sm:gap-2.5 sm:text-lg">
          <span aria-hidden className="relative inline-block h-5 w-5 rounded-full bg-text">
            {/* crescent: a bg-colored disc offset over the Moon */}
            <span className="absolute -top-0.5 left-1.5 h-5 w-5 rounded-full bg-bg" />
          </span>
          Shadowline
        </Link>
        <nav aria-label="Main" className="flex items-center text-sm sm:gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full px-2 py-2 text-muted transition-colors hover:bg-surface hover:text-text sm:px-3"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-full px-2 py-2 text-muted transition-colors hover:bg-surface hover:text-text sm:px-3"
          >
            GitHub<span aria-hidden className="hidden sm:inline"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
