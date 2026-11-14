import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:bg-text",
  secondary: "border border-border bg-surface text-text hover:border-accent/60",
  ghost: "text-accent hover:bg-surface",
};

type CommonProps = {
  variant?: Variant;
  /** Show a trailing → arrow. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

type LinkProps = CommonProps & { href: string; external?: boolean };
type NativeProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export function Button(props: LinkProps | NativeProps) {
  const { variant = "primary", arrow = false, className = "", children, ...rest } = props;
  const cls = `${BASE} ${VARIANTS[variant]} ${className}`;
  const content = (
    <>
      {children}
      {arrow && (
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      )}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, external } = rest as Pick<LinkProps, "href" | "external">;
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={`group ${cls}`}>
        {content}
      </a>
    ) : (
      <Link href={href} className={`group ${cls}`}>
        {content}
      </Link>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" {...buttonProps} className={`group ${cls}`}>
      {content}
    </button>
  );
}
