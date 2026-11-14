import type { HTMLAttributes } from "react";

/** Rounded glass panel (translucent surface, backdrop blur, hairline border). */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`glass rounded-2xl p-5 ${className}`} />;
}
