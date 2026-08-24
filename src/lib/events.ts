import type { EonetEvent, EonetGeometry } from '../api/eonet'

/**
 * EONET's `closed` flag answers "did a source file a closing report?", not "is this
 * event still happening?". Plenty of events stay open forever because reporting simply
 * stopped. Freshness -- time since the most recent observation -- is the honest signal,
 * so it is what this app filters and colours by.
 */
export type Freshness = 'active' | 'recent' | 'stale' | 'dormant' | 'closed'

export const FRESHNESS_META: Record<
  Freshness,
  { label: string; blurb: string; color: string }
> = {
  active: { label: 'Active', blurb: 'Observed in the last 7 days', color: '#22d3ee' },
  recent: { label: 'Recent', blurb: 'Last observed 8–30 days ago', color: '#4ade80' },
  stale: { label: 'Stale', blurb: 'Last observed 1–12 months ago', color: '#facc15' },
  dormant: {
    label: 'Dormant',
    blurb: 'Still "open" but unobserved for over a year',
    color: '#fb923c',
  },
  closed: {
    label: 'Closed',
    blurb: 'A source declared the event over',
    color: '#94a3b8',
  },
}

export const FRESHNESS_ORDER: Freshness[] = [
  'active',
  'recent',
  'stale',
  'dormant',
  'closed',
]

export interface DerivedEvent {
  raw: EonetEvent
  id: string
  title: string
  categoryId: string
  categoryTitle: string
  /** Most recent observation timestamp, in ms. */
  lastObserved: number
  firstObserved: number
  ageDays: number
  freshness: Freshness
  /** Ordered oldest-first; the track a moving event traced. */
  track: EonetGeometry[]
  isTrack: boolean
  peakMagnitude: { value: number; unit: string } | null
}

const DAY = 86_400_000

export function toLatLng(g: EonetGeometry): [number, number] | null {
  if (g.type !== 'Point') return null
  const c = g.coordinates as number[]
  if (c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null
  return [c[1], c[0]]
}

export function polygonLatLngs(g: EonetGeometry): [number, number][][] {
  if (g.type !== 'Polygon') return []
  return (g.coordinates as number[][][]).map((ring) =>
    ring.map((p) => [p[1], p[0]] as [number, number]),
  )
}

export function deriveEvent(raw: EonetEvent, now: number): DerivedEvent | null {
  if (!raw.geometry?.length) return null

  const track = [...raw.geometry].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const firstObserved = Date.parse(track[0].date)
  const lastObserved = Date.parse(track[track.length - 1].date)
  if (!Number.isFinite(lastObserved)) return null

  const ageDays = Math.max(0, Math.floor((now - lastObserved) / DAY))

  let freshness: Freshness
  if (raw.closed) freshness = 'closed'
  else if (ageDays <= 7) freshness = 'active'
  else if (ageDays <= 30) freshness = 'recent'
  else if (ageDays <= 365) freshness = 'stale'
  else freshness = 'dormant'

  // Magnitudes are only comparable within a unit (acres vs hectares vs kts), so we keep
  // the unit attached rather than reducing everything to a bare number.
  let peakMagnitude: DerivedEvent['peakMagnitude'] = null
  for (const g of track) {
    if (typeof g.magnitudeValue === 'number' && g.magnitudeUnit) {
      if (!peakMagnitude || g.magnitudeValue > peakMagnitude.value) {
        peakMagnitude = { value: g.magnitudeValue, unit: g.magnitudeUnit }
      }
    }
  }

  const cat = raw.categories[0]
  return {
    raw,
    id: raw.id,
    title: raw.title,
    categoryId: cat?.id ?? 'unknown',
    categoryTitle: cat?.title ?? 'Uncategorised',
    lastObserved,
    firstObserved,
    ageDays,
    freshness,
    track,
    isTrack: track.length > 1,
    peakMagnitude,
  }
}

export function formatAge(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 45) return `${days} days ago`
  const months = Math.round(days / 30)
  if (months < 24) return `${months} months ago`
  return `${(days / 365).toFixed(1)} years ago`
}

export function formatMagnitude(value: number, unit: string): string {
  const n = value >= 1000 ? Math.round(value).toLocaleString() : String(value)
  return `${n} ${unit}`
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}
