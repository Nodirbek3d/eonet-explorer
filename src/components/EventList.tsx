import { useEffect, useRef } from 'react'
import type { DerivedEvent } from '../lib/events'
import { FRESHNESS_META, formatAge, formatMagnitude } from '../lib/events'
import { categoryColor } from '../lib/categories'

interface Props {
  events: DerivedEvent[]
  selected: DerivedEvent | null
  onSelect: (e: DerivedEvent) => void
}

/** Rendering thousands of rows janks the map; the list is a browsing aid, not a dump. */
const RENDER_CAP = 300

export default function EventList({ events, selected, onSelect }: Props) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (events.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-slate-500">
        No events match these filters.
      </div>
    )
  }

  const shown = events.slice(0, RENDER_CAP)

  return (
    <ul className="divide-y divide-slate-800/60">
      {shown.map((e) => {
        const isSel = selected?.id === e.id
        return (
          <li key={e.id} ref={isSel ? ref : undefined}>
            <button
              onClick={() => onSelect(e)}
              className={`flex w-full gap-2.5 px-4 py-2 text-left transition ${
                isSel ? 'bg-slate-800/70' : 'hover:bg-slate-800/30'
              }`}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: categoryColor(e.categoryId) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-slate-200">
                  {e.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <span style={{ color: FRESHNESS_META[e.freshness].color }}>
                    {formatAge(e.ageDays)}
                  </span>
                  {e.peakMagnitude && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span>
                        {formatMagnitude(e.peakMagnitude.value, e.peakMagnitude.unit)}
                      </span>
                    </>
                  )}
                  {e.isTrack && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="text-violet-400">
                        track · {e.track.length} pts
                      </span>
                    </>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
      {events.length > RENDER_CAP && (
        <li className="px-4 py-2.5 text-xs text-slate-500">
          Showing {RENDER_CAP} of {events.length.toLocaleString()} matching events. All of
          them are on the map — narrow the filters to bring the rest into this list.
        </li>
      )}
    </ul>
  )
}
