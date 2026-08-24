import type { Window } from '../api/eonet'
import type { DerivedEvent } from '../lib/events'

/**
 * A short primer on how EONET actually behaves. The numbers are computed from the data
 * currently loaded rather than hardcoded, so the claims stay true as the feed moves.
 */
export default function DataNotes({
  events,
  windowDays,
  truncated,
  onClose,
}: {
  events: DerivedEvent[]
  windowDays: Window
  truncated: boolean
  onClose: () => void
}) {
  const total = events.length || 1
  const open = events.filter((e) => !e.raw.closed)
  const dormant = open.filter((e) => e.freshness === 'dormant').length
  const wildfires = events.filter((e) => e.categoryId === 'wildfires').length
  const tracks = events.filter((e) => e.isTrack).length
  const noDesc = events.filter((e) => !e.raw.description).length
  const units = [...new Set(events.map((e) => e.peakMagnitude?.unit).filter(Boolean))]

  const pct = (n: number, d = total) => `${Math.round((n / d) * 100)}%`

  return (
    <div
      className="absolute inset-0 z-[1000] flex justify-end bg-black/50"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-800 bg-[#0d131b] px-6 py-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              What you should know about EONET
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Computed from the {events.length.toLocaleString()} events currently loaded
              {windowDays === 'backlog'
                ? ' from the API default (all open events, no date bound).'
                : ` for the last ${windowDays} days.`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 text-sm leading-relaxed text-slate-300">
          <section>
            <h3 className="mb-1 font-medium text-slate-100">
              “Open” does not mean “still happening”
            </h3>
            <p>
              An event stays open until a reporting source files a closing report. Many
              never get one.{' '}
              {dormant > 0 ? (
                <>
                  Of the {open.length.toLocaleString()} open events loaded,{' '}
                  <strong className="text-orange-300">{dormant.toLocaleString()}</strong>{' '}
                  ({pct(dormant, open.length || 1)}) have not been observed in over a
                  year.
                </>
              ) : (
                <>
                  You cannot see that from here: a bounded window filters on the event
                  date, so it excludes the abandoned tail by construction. Switch the time
                  window to <strong className="text-orange-300">Open backlog</strong> to
                  see what the unfiltered feed actually contains.
                </>
              )}
            </p>
            <p className="mt-1.5 text-slate-400">
              The API defaults to <code className="text-cyan-400">status=open</code>, so
              the obvious first request returns a pile of long-abandoned events and hides
              every closed one. For windowed views this app requests{' '}
              <code className="text-cyan-400">status=all</code> and ranks by{' '}
              <em>last observation</em> instead.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-medium text-slate-100">
              Wildfires drown out everything
            </h3>
            <p>
              {wildfires.toLocaleString()} of {events.length.toLocaleString()} events (
              {pct(wildfires)}) are wildfires. Categories like volcanoes and sea &amp;
              lake ice are rounding errors by count but are the more interesting ones to
              look at, which is why the category filter shows counts and the palette
              favours the rare categories.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-medium text-slate-100">
              Some events are paths, not points
            </h3>
            <p>
              {tracks.toLocaleString()} events carry more than one geometry. A tropical
              cyclone is an ordered series of 6-hourly fixes with wind speed attached —
              drawing it as one dot throws away the whole story. Those render as tracks on
              the map, with magnitude plotted over time in the detail panel.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-medium text-slate-100">
              Magnitudes are not comparable
            </h3>
            <p>
              Units in this window:{' '}
              {units.map((u) => (
                <code key={u} className="mr-1 text-cyan-400">
                  {u}
                </code>
              ))}
              . Fire size arrives in both acres and hectares depending on the source, and
              storms in knots. Nothing is normalised, so magnitude is only ever shown with
              its unit and never aggregated across events.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-medium text-slate-100">The metadata is thin</h3>
            <p>
              {pct(noDesc)} of events have no description at all, and titles are the only
              real descriptive field. Source links point off to agencies like IRWIN, JTWC
              and NOAA — some of those pages have since gone dead. There is no severity
              ranking, no casualty data, and no per-event geometry for most fires beyond a
              single centroid.
            </p>
          </section>

          {truncated && (
            <section className="rounded border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              This window hit the API's 5,000-event response cap, so the oldest events in
              it are missing. Narrow the time window for a complete picture.
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
