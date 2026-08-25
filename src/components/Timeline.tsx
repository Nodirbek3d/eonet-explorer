import { useMemo, useRef, useState } from 'react'
import type { DerivedEvent } from '../lib/events'
import { FRESHNESS_META } from '../lib/events'

export interface TimeRange {
  start: number
  end: number
}

interface Props {
  /** Events after every filter *except* the time brush, so the histogram stays stable. */
  events: DerivedEvent[]
  /** Span the histogram covers, in ms. */
  spanStart: number
  spanEnd: number
  range: TimeRange | null
  onRangeChange: (r: TimeRange | null) => void
}

const DAY = 86_400_000

/**
 * Histogram of events by last-observed date, doubling as a drag-to-brush time filter.
 * Bars are stacked by freshness so the "these are all months old" shape is visible at a
 * glance rather than only after filtering.
 */
export default function Timeline({
  events,
  spanStart,
  spanEnd,
  range,
  onRangeChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null)

  const { bins, t0, binMs, max } = useMemo(() => {
    const start = spanStart
    const now = spanEnd
    const spanDays = (now - start) / DAY
    const count = Math.min(60, Math.max(12, spanDays <= 30 ? Math.round(spanDays) : 52))
    const binMs = (now - start) / count
    const bins: { total: number; byFresh: Record<string, number> }[] = Array.from(
      { length: count },
      () => ({ total: 0, byFresh: {} }),
    )

    for (const e of events) {
      const idx = Math.floor((e.lastObserved - start) / binMs)
      if (idx < 0 || idx >= count) continue
      bins[idx].total++
      bins[idx].byFresh[e.freshness] = (bins[idx].byFresh[e.freshness] ?? 0) + 1
    }
    return { bins, t0: start, binMs, max: Math.max(1, ...bins.map((b) => b.total)) }
  }, [events, spanStart, spanEnd])

  const H = 44

  function xToBin(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect()
    const frac = (clientX - rect.left) / rect.width
    return Math.min(bins.length - 1, Math.max(0, Math.floor(frac * bins.length)))
  }

  function commit(a: number, b: number) {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    onRangeChange({ start: t0 + lo * binMs, end: t0 + (hi + 1) * binMs })
  }

  const selLo = drag ? Math.min(drag.a, drag.b) : null
  const selHi = drag ? Math.max(drag.a, drag.b) : null

  return (
    <div className="border-t border-slate-800 bg-[#0d131b] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          Events by last observation
        </span>
        {range ? (
          <button
            onClick={() => onRangeChange(null)}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            clear time filter ✕
          </button>
        ) : (
          <span className="text-xs text-slate-600">drag to filter by date</span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${bins.length} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full cursor-crosshair touch-none select-none"
        onPointerDown={(e) => {
          const i = xToBin(e.clientX)
          setDrag({ a: i, b: i })
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag) return
          setDrag({ ...drag, b: xToBin(e.clientX) })
        }}
        onPointerUp={() => {
          if (drag) commit(drag.a, drag.b)
          setDrag(null)
        }}
      >
        {bins.map((bin, i) => {
          let y = H
          const binStart = t0 + i * binMs
          const inDrag = selLo !== null && i >= selLo && i <= selHi!
          // While dragging, preview the selection; once committed, keep it marked.
          const dimmed = drag
            ? !inDrag
            : range
              ? binStart + binMs <= range.start || binStart >= range.end
              : false
          return (
            <g key={i} opacity={dimmed ? 0.25 : 1}>
              {Object.entries(bin.byFresh).map(([f, n]) => {
                const h = (n / max) * H
                y -= h
                return (
                  <rect
                    key={f}
                    x={i + 0.1}
                    y={y}
                    width={0.8}
                    height={h}
                    fill={FRESHNESS_META[f as keyof typeof FRESHNESS_META].color}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      <div className="mt-0.5 flex justify-between font-mono text-[11px] text-slate-600">
        <span>{new Date(t0).toISOString().slice(0, 10)}</span>
        {!range && <span className="text-slate-700">last observation date →</span>}
        {range && (
          <span className="text-cyan-400">
            {new Date(range.start).toISOString().slice(0, 10)} →{' '}
            {new Date(range.end).toISOString().slice(0, 10)}
          </span>
        )}
        <span>now</span>
      </div>
    </div>
  )
}
