import type { DerivedEvent } from '../lib/events'
import { FRESHNESS_META, formatAge, formatDate, formatMagnitude } from '../lib/events'
import { categoryColor } from '../lib/categories'

/**
 * Magnitude over the life of the event. Only rendered when the source actually attached
 * magnitudes -- roughly 95% of geometries have them, but the unit varies by source, so a
 * single track is the only place they can be compared honestly.
 */
function MagnitudeSparkline({ event }: { event: DerivedEvent }) {
  const pts = event.track
    .map((g, i) => ({
      i,
      v: g.magnitudeValue,
      d: Date.parse(g.date),
      u: g.magnitudeUnit,
    }))
    .filter(
      (p): p is { i: number; v: number; d: number; u: string } =>
        typeof p.v === 'number' &&
        Number.isFinite(p.v) &&
        Number.isFinite(p.d) &&
        typeof p.u === 'string' &&
        p.u.length > 0,
    )

  if (pts.length < 2) return null

  const unit = pts[0].u
  const comparablePts = pts.filter((p) => p.u === unit)
  if (comparablePts.length < 2) return null

  const max = Math.max(...comparablePts.map((p) => p.v))
  const min = Math.min(...comparablePts.map((p) => p.v))
  const span = max - min || 1
  const t0 = comparablePts[0].d
  const tSpan = comparablePts[comparablePts.length - 1].d - t0 || 1
  const W = 300
  const H = 56

  const path = comparablePts
    .map((p, i) => {
      const x = ((p.d - t0) / tSpan) * W
      const y = H - ((p.v - min) / span) * H
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const color = categoryColor(event.categoryId)

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
          Magnitude over time
        </span>
        <span className="font-mono text-[11px] text-slate-500">
          {min === max ? formatMagnitude(max, unit) : `${min}–${max} ${unit}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" preserveAspectRatio="none">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill={color} opacity={0.12} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

export default function EventDetail({
  event,
  onClose,
}: {
  event: DerivedEvent
  onClose: () => void
}) {
  const meta = FRESHNESS_META[event.freshness]
  const color = categoryColor(event.categoryId)
  const durationDays = Math.max(
    0,
    Math.round((event.lastObserved - event.firstObserved) / 86_400_000),
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-snug font-semibold text-slate-100">
            {event.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span style={{ color }}>{event.categoryTitle}</span>
            <span className="text-slate-700">·</span>
            <span style={{ color: meta.color }}>{meta.label}</span>
            <span className="text-slate-700">·</span>
            <span className="font-mono text-slate-500">{event.id}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded px-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Close detail panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-slate-500">Last observed</dt>
            <dd className="mt-0.5 text-slate-200">{formatAge(event.ageDays)}</dd>
            <dd className="font-mono text-[10px] text-slate-500">
              {formatDate(event.lastObserved)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Observations</dt>
            <dd className="mt-0.5 text-slate-200">
              {event.track.length}
              {event.isTrack && (
                <span className="text-slate-500"> over {durationDays}d</span>
              )}
            </dd>
          </div>
          {event.peakMagnitude && (
            <div>
              <dt className="text-slate-500">Peak magnitude</dt>
              <dd className="mt-0.5 text-slate-200">
                {formatMagnitude(event.peakMagnitude.value, event.peakMagnitude.unit)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">API status</dt>
            <dd className="mt-0.5 text-slate-200">
              {event.raw.closed ? 'closed' : 'open'}
            </dd>
          </div>
        </dl>

        {/* The single most misleading field in the dataset, called out where it matters. */}
        {event.freshness === 'dormant' && (
          <p className="mt-4 rounded border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-xs leading-relaxed text-orange-200/90">
            EONET still lists this event as <strong>open</strong>, but nothing has been
            reported for {formatAge(event.ageDays)}. Open means "no source filed a closing
            report" — not "still burning".
          </p>
        )}

        <MagnitudeSparkline event={event} />

        {event.raw.description && (
          <p className="mt-4 text-xs leading-relaxed text-slate-300">
            {event.raw.description}
          </p>
        )}

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            Sources
          </div>
          {event.raw.sources.length === 0 && (
            <p className="text-xs text-slate-500">None listed.</p>
          )}
          <ul className="space-y-1">
            {event.raw.sources.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-cyan-400 underline-offset-2 hover:underline"
                >
                  {s.id} ↗
                </a>
              </li>
            ))}
          </ul>
          <a
            href={event.raw.link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-mono text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >
            raw EONET JSON ↗
          </a>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            Observation log
          </div>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto font-mono text-[11px]">
            {[...event.track].reverse().map((g, i) => (
              <li key={i} className="flex justify-between gap-2 text-slate-400">
                <span>{formatDate(Date.parse(g.date))}</span>
                <span className="text-slate-500">
                  {typeof g.magnitudeValue === 'number' && g.magnitudeUnit
                    ? formatMagnitude(g.magnitudeValue, g.magnitudeUnit)
                    : g.type}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
