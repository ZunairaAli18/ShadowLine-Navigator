import { Button, Card } from "@/components/ui";

/** Friendly error card for live sections. */
export function LiveError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-heading text-lg font-semibold">Model is waking up…</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

/** Pulsing placeholder while live data loads. */
export function LiveSkeleton({ className = "h-64", label = "Loading live data…" }: { className?: string; label?: string }) {
  return (
    <div className={`grid animate-pulse place-items-center rounded-2xl bg-bg/40 text-sm text-muted motion-reduce:animate-none ${className}`} role="status">
      {label}
    </div>
  );
}
