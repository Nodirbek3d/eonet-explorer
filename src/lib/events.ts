import type { EonetEvent, EonetGeometry } from '../api/eonet'

/**
 * EONET's `closed` flag answers "did a source file a closing report?", not "is this
 * event still happening?". Plenty of events stay open forever because reporting simply
 * stopped. Freshness -- time since the most recent observation -- is the honest signal,
 * so it is what this app filters and colours by.
 */
export type Freshness = 'active' | 'recent' | 'stale' | 'dormant' | 'closed'
export type LatLng = [number, number]

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
  /** Point geometries converted to Leaflet's [lat, lng] shape. */
  points: LatLng[]
  /** Polygon rings converted to Leaflet's [lat, lng] shape. */
  polygons: LatLng[][]
  isTrack: boolean
  peakMagnitude: { value: number; unit: string } | null
}

const DAY = 86_400_000

const LAT_LIMIT = 90
const LON_LIMIT = 180

/**
 * EONET is not internally consistent about coordinate order.
 *
 * Point geometries follow the GeoJSON convention of `[lon, lat]`. The flood polygons
 * GDACS supplies do not -- they arrive as `[lat, lon]`. Across every sample I pulled,
 * 41,357 polygon vertices proved to be `[lat, lon]` (their second value exceeds the
 * +/-90 latitude range, so it can only be a longitude) and not one proved otherwise;
 * conversely 788 point vertices proved to be `[lon, lat]` and none proved otherwise.
 * Read a flood polygon the standard way and it lands on the wrong continent.
 *
 * So rather than trusting either convention, the order is probed per geometry: any value
 * beyond +/-90 can only be a longitude, which settles it. Small features where both
 * readings are plausible fall back to whatever that geometry type has always used.
 */
type CoordOrder = 'lonlat' | 'latlon'

function detectOrder(pairs: readonly unknown[], fallback: CoordOrder): CoordOrder {
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const first: unknown = pair[0]
    const second: unknown = pair[1]
    if (typeof second === 'number' && Math.abs(second) > LAT_LIMIT) return 'latlon'
    if (typeof first === 'number' && Math.abs(first) > LAT_LIMIT) return 'lonlat'
  }
  return fallback
}

function coordinateToLatLng(coordinates: unknown, order: CoordOrder): LatLng | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const first: unknown = coordinates[0]
  const second: unknown = coordinates[1]
  if (typeof first !== 'number' || typeof second !== 'number') return null
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null

  const [lat, lng] = order === 'latlon' ? [first, second] : [second, first]
  if (Math.abs(lat) > LAT_LIMIT || Math.abs(lng) > LON_LIMIT) return null
  return [lat, lng]
}

function isLatLng(value: LatLng | null): value is LatLng {
  return value !== null
}

function toLatLng(g: EonetGeometry): LatLng | null {
  if (g.type !== 'Point') return null
  const order = detectOrder([g.coordinates], 'lonlat')
  return coordinateToLatLng(g.coordinates, order)
}

function polygonLatLngs(g: EonetGeometry): LatLng[][] {
  if (g.type !== 'Polygon') return []

  const rings: unknown = g.coordinates
  if (!Array.isArray(rings)) return []

  // One order per geometry, decided from every vertex it contains.
  const vertices = (rings as unknown[]).flatMap((ring) =>
    Array.isArray(ring) ? (ring as unknown[]) : [],
  )
  const order = detectOrder(vertices, 'latlon')

  const validRings: LatLng[][] = []
  for (const ring of rings as unknown[]) {
    if (!Array.isArray(ring)) continue
    const latLngs = (ring as unknown[])
      .map((p) => coordinateToLatLng(p, order))
      .filter(isLatLng)
    if (latLngs.length >= 3) validRings.push(latLngs)
  }
  return validRings
}

export function deriveEvent(raw: EonetEvent, now: number): DerivedEvent | null {
  if (!raw.geometry?.length) return null

  const datedGeometry = raw.geometry
    .map((geometry) => ({ geometry, observedAt: Date.parse(geometry.date) }))
    .filter(({ observedAt }) => Number.isFinite(observedAt))
    .sort((a, b) => a.observedAt - b.observedAt)

  if (!datedGeometry.length) return null

  const track = datedGeometry.map(({ geometry }) => geometry)
  const firstObserved = datedGeometry[0].observedAt
  const lastObserved = datedGeometry[datedGeometry.length - 1].observedAt
  const points = track.map(toLatLng).filter(isLatLng)
  const polygons = track.flatMap(polygonLatLngs)
  if (!points.length && !polygons.length) return null

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
    if (
      typeof g.magnitudeValue === 'number' &&
      Number.isFinite(g.magnitudeValue) &&
      g.magnitudeUnit
    ) {
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
    points,
    polygons,
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
