/**
 * Shown instantly on every navigation (FOKAS D25): without it the previous
 * page stays on screen until the new one's data loads.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Loading" role="status">
      <div className="h-8 w-48 rounded-lg bg-neutral-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-44 rounded-2xl bg-neutral-200" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-neutral-200" />
    </div>
  );
}
