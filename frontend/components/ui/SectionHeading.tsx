import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
};

export function SectionHeading({ eyebrow, title, description, viewAllHref, viewAllLabel = "View all", className = "" }: Props) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="text-3xl sm:text-4xl">{title}</h2>
        {description && <p className="mt-3 text-muted">{description}</p>}
      </div>
      {viewAllHref && (
        <Link href={viewAllHref} className="shrink-0 text-sm font-semibold text-accent hover:text-text">
          {viewAllLabel} <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}
