export function Skeleton({ rows = 8, className = "h-12" }: { rows?: number; className?: string }) {
  return (
    <div className="flex animate-pulse flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`rounded-xl bg-current/10 ${className}`} />
      ))}
    </div>
  );
}
