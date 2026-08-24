import type { Window } from '../api/eonet'
import type { Freshness } from '../lib/events'
import { FRESHNESS_META, FRESHNESS_ORDER } from '../lib/events'
import { categoryColor } from '../lib/categories'

const WINDOWS: { value: Window; label: string; title: string }[] = [
  { value: 7, label: '7d', title: 'Events dated in the last 7 days' },
  { value: 30, label: '30d', title: 'Events dated in the last 30 days' },
  { value: 90, label: '90d', title: 'Events dated in the last 90 days' },
  { value: 365, label: '1y', title: 'Events dated in the last year' },
  {
    value: 'backlog',
    label: 'Open backlog',
    title:
      "What the API's default request returns: every open event, unbounded by date. Mostly abandoned records.",
  },
]

interface Props {
  windowDays: Window
  onWindowChange: (d: Window) => void
  freshness: Set<Freshness>
  onFreshnessToggle: (f: Freshness) => void
  freshnessCounts: Record<string, number>
  categories: Set<string>
  onCategoryToggle: (id: string) => void
  categoryCounts: { id: string; title: string; count: number }[]
  search: string
  onSearchChange: (s: string) => void
  onReset: () => void
}

function Chip({
  active,
  color,
  onClick,
  children,
  title,
}: {
  active: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
        active
          ? 'border-slate-600 bg-slate-800 text-slate-100'
          : 'border-slate-800 bg-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300'
      }`}
    >
      {color && (
        <span
          className="h-2 w-2 shrink-0 rounded-full transition"
          style={{ background: color, opacity: active ? 1 : 0.35 }}
        />
      )}
      {children}
    </button>
  )
}

export default function FilterPanel(p: Props) {
  return (
    <div className="space-y-3 border-b border-slate-800 px-4 py-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            Time window
          </span>
          <button
            onClick={p.onReset}
            className="text-[11px] text-slate-500 transition hover:text-slate-300"
          >
            reset
          </button>
        </div>
        <div className="flex gap-1.5">
          {WINDOWS.filter((w) => w.value !== 'backlog').map((w) => (
            <button
              key={String(w.value)}
              onClick={() => p.onWindowChange(w.value)}
              title={w.title}
              className={`flex-1 rounded border px-2 py-1 text-xs transition ${
                p.windowDays === w.value
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => p.onWindowChange('backlog')}
          title={WINDOWS[WINDOWS.length - 1].title}
          className={`mt-1.5 w-full rounded border px-2 py-1 text-xs transition ${
            p.windowDays === 'backlog'
              ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
              : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          Open backlog — what the API default returns
        </button>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
          Freshness
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FRESHNESS_ORDER.map((f) => (
            <Chip
              key={f}
              active={p.freshness.has(f)}
              color={FRESHNESS_META[f].color}
              onClick={() => p.onFreshnessToggle(f)}
              title={FRESHNESS_META[f].blurb}
            >
              {FRESHNESS_META[f].label}
              <span className="font-mono text-slate-500">
                {p.freshnessCounts[f] ?? 0}
              </span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
          Category
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.categoryCounts.map((c) => (
            <Chip
              key={c.id}
              active={p.categories.has(c.id)}
              color={categoryColor(c.id)}
              onClick={() => p.onCategoryToggle(c.id)}
            >
              {c.title}
              <span className="font-mono text-slate-500">{c.count}</span>
            </Chip>
          ))}
        </div>
      </div>

      <input
        value={p.search}
        onChange={(e) => p.onSearchChange(e.target.value)}
        placeholder="Filter by title…"
        className="w-full rounded border border-slate-800 bg-[#0b1017] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 transition outline-none focus:border-slate-600"
      />
    </div>
  )
}
