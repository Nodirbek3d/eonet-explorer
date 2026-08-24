import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEvents, MAX_LIMIT } from './api/eonet'
import type { Window } from './api/eonet'
import type { DerivedEvent, Freshness } from './lib/events'
import { deriveEvent, FRESHNESS_ORDER } from './lib/events'
import MapView from './components/MapView'
import FilterPanel from './components/FilterPanel'
import EventList from './components/EventList'
import EventDetail from './components/EventDetail'
import Timeline from './components/Timeline'
import type { TimeRange } from './components/Timeline'
import DataNotes from './components/DataNotes'

const DEFAULT_WINDOW = 30

/**
 * Dormant events are excluded by default. They are the majority of what the API returns,
 * they are almost all stale wildfire records, and leaving them on makes the map read as
 * though half the planet is currently on fire. The filter is visible and one click away
 * so the omission is never silent.
 */
const DEFAULT_FRESHNESS: Freshness[] = ['active', 'recent', 'stale', 'closed']

export default function App() {
  const [windowDays, setWindowDays] = useState<Window>(DEFAULT_WINDOW)
  const [freshness, setFreshness] = useState<Set<Freshness>>(new Set(DEFAULT_FRESHNESS))
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<TimeRange | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const { data, dataUpdatedAt, isLoading, isError, error } = useQuery({
    queryKey: ['events', windowDays],
    queryFn: () => fetchEvents(windowDays),
  })

  // Freshness is measured against the moment the data was fetched, not the moment a
  // component happened to re-render. That keeps the derivation pure and stable, and it is
  // the more honest reference point: "3 days old" should mean 3 days old as of this data.
  const all = useMemo(() => {
    return (data ?? [])
      .map((e) => deriveEvent(e, dataUpdatedAt))
      .filter((e): e is DerivedEvent => e !== null)
      .sort((a, b) => b.lastObserved - a.lastObserved)
  }, [data, dataUpdatedAt])

  const truncated = (data?.length ?? 0) >= MAX_LIMIT

  // Counts reflect every *other* active filter, so a chip's number tells you what you
  // would actually get by clicking it.
  const categoryCounts = useMemo(() => {
    const pool = all.filter((e) => freshness.has(e.freshness))
    const map = new Map<string, { id: string; title: string; count: number }>()
    for (const e of pool) {
      const cur = map.get(e.categoryId)
      if (cur) cur.count++
      else map.set(e.categoryId, { id: e.categoryId, title: e.categoryTitle, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [all, freshness])

  const freshnessCounts = useMemo(() => {
    const pool = categories.size ? all.filter((e) => categories.has(e.categoryId)) : all
    const counts: Record<string, number> = {}
    for (const f of FRESHNESS_ORDER) counts[f] = 0
    for (const e of pool) counts[e.freshness]++
    return counts
  }, [all, categories])

  /** Everything except the time brush — this feeds the histogram. */
  const preTimeFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(
      (e) =>
        freshness.has(e.freshness) &&
        (categories.size === 0 || categories.has(e.categoryId)) &&
        (q === '' || e.title.toLowerCase().includes(q)),
    )
  }, [all, freshness, categories, search])

  const filtered = useMemo(() => {
    if (!range) return preTimeFiltered
    return preTimeFiltered.filter(
      (e) => e.lastObserved >= range.start && e.lastObserved <= range.end,
    )
  }, [preTimeFiltered, range])

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? null,
    [filtered, selectedId],
  )

  // The backlog has no date bound, so the histogram spans whatever came back.
  const [spanStart, spanEnd] = useMemo(() => {
    const now = dataUpdatedAt
    if (windowDays !== 'backlog') return [now - windowDays * 86_400_000, now]
    if (!all.length) return [now - 86_400_000, now]
    return [Math.min(...all.map((e) => e.lastObserved)), now]
  }, [windowDays, all, dataUpdatedAt])

  function toggle<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  function reset() {
    setWindowDays(DEFAULT_WINDOW)
    setFreshness(new Set(DEFAULT_FRESHNESS))
    setCategories(new Set())
    setSearch('')
    setRange(null)
    setSelectedId(null)
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-[#0d131b] px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">
            EONET Explorer
          </h1>
          <span className="hidden text-xs text-slate-500 lg:inline">
            NASA natural event feed, ranked by what was actually observed most recently
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-slate-500">
            {isLoading ? 'loading…' : `${filtered.length.toLocaleString()} shown`}
            {!isLoading && filtered.length !== all.length && (
              <span className="text-slate-600">
                {' '}
                / {all.length.toLocaleString()} loaded
              </span>
            )}
          </span>
          <button
            onClick={() => setNotesOpen(true)}
            className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Read this first
          </button>
        </div>
      </header>

      {windowDays === 'backlog' && (
        <div className="shrink-0 border-b border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-[11px] text-orange-200/90">
          Showing <code>GET /events</code> with no parameters — the API's own default.
          Every event here is flagged <strong>open</strong>, yet most have not been
          observed in over a year. This is the pile a naive integration would render as
          “currently happening”.
          {truncated &&
            ` Capped at ${MAX_LIMIT.toLocaleString()} events — there are more.`}
        </div>
      )}

      {truncated && windowDays !== 'backlog' && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-200/90">
          This window returned the API's maximum of {MAX_LIMIT.toLocaleString()} events —
          the oldest events in the range are missing. Try a shorter window.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-slate-800 bg-[#0d131b]">
          <FilterPanel
            windowDays={windowDays}
            onWindowChange={(d) => {
              setWindowDays(d)
              setRange(null)
              // The backlog exists to show the dormant pile, so surface it on arrival
              // rather than leaving the user to guess why the map looks empty.
              setFreshness(
                d === 'backlog' ? new Set(FRESHNESS_ORDER) : new Set(DEFAULT_FRESHNESS),
              )
            }}
            freshness={freshness}
            onFreshnessToggle={(f) => setFreshness((s) => toggle(s, f))}
            freshnessCounts={freshnessCounts}
            categories={categories}
            onCategoryToggle={(id) => setCategories((s) => toggle(s, id))}
            categoryCounts={categoryCounts}
            search={search}
            onSearchChange={setSearch}
            onReset={reset}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                Loading events…
              </div>
            )}
            {isError && (
              <div className="px-4 py-8 text-center text-xs text-red-400">
                {error.message}
              </div>
            )}
            {!isLoading && !isError && (
              <EventList
                events={filtered}
                selected={selected}
                onSelect={(e) => setSelectedId(e.id)}
              />
            )}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1">
          <MapView
            events={filtered}
            selected={selected}
            onSelect={(e) => setSelectedId(e?.id ?? null)}
          />
        </main>

        {selected && (
          <aside className="w-[340px] shrink-0 border-l border-slate-800 bg-[#0d131b]">
            <EventDetail event={selected} onClose={() => setSelectedId(null)} />
          </aside>
        )}
      </div>

      <Timeline
        events={preTimeFiltered}
        spanStart={spanStart}
        spanEnd={spanEnd}
        range={range}
        onRangeChange={setRange}
      />

      {notesOpen && (
        <DataNotes
          events={all}
          windowDays={windowDays}
          truncated={truncated}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  )
}
