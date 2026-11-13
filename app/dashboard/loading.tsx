// Route-segment skeleton shown while the dashboard's client bundle loads,
// so navigation never lands on a blank frame.
export default function DashboardLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
      <div className="mt-3 h-8 w-56 animate-pulse rounded bg-surface-3" />
      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
