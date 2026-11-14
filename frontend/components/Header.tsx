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
        <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight">
          <span aria-hidden className="relative inline-block h-5 w-5 rounded-full bg-text">
            {/* crescent: a bg-colored disc offset over the Moon */}
            <span className="absolute -top-0.5 left-1.5 h-5 w-5 rounded-full bg-bg" />
          </span>
          Shadowline
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-text"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-text"
          >
            GitHub <span aria-hidden>↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
