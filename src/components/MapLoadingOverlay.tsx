/**
 * Shown while a window's events are in flight. The wide windows return thousands of
 * events and can take several seconds, and a refetch keeps the previous map on screen --
 * without this the app looks frozen on stale data. Non-blocking on purpose: the map stays
 * pannable while the request runs.
 */
export default function MapLoadingOverlay({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-[#0b1017]/40"
    >
      <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-[#0d131b]/95 px-4 py-3 shadow-xl shadow-black/40">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
        <div>
          <div className="text-xs font-medium text-slate-200">Loading events…</div>
          <div className="text-[11px] text-slate-500">{label}</div>
        </div>
      </div>
    </div>
  )
}
