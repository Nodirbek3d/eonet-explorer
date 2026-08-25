const BASE = 'https://eonet.gsfc.nasa.gov/api/v3'

/** The API caps a single response; we request the max and surface truncation to the user. */
export const MAX_LIMIT = 5000

export interface EonetGeometry {
  date: string
  type: 'Point' | 'Polygon'
  /** Point: [lon, lat]. Polygon: [ring][vertex][lon, lat]. */
  coordinates: number[] | number[][][]
  magnitudeValue?: number | null
  magnitudeUnit?: string | null
}

export interface EonetCategory {
  id: string
  title: string
  description?: string
}

export interface EonetEvent {
  id: string
  title: string
  description: string | null
  link: string
  /** ISO date if the reporting source declared the event over, otherwise null. */
  closed: string | null
  categories: EonetCategory[]
  sources: { id: string; url: string }[]
  geometry: EonetGeometry[]
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal })
  if (!res.ok) throw new Error(`EONET ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

/** A rolling window in days, or the API's own unfiltered default. */
export type Window = number | 'backlog'

/**
 * Fetches events for a rolling window.
 *
 * For day windows we pass `status=all`, because the API's default of `status=open`
 * silently omits every event a source has closed out. Note that `days=N` filters on the
 * event date, so a bounded window also excludes the long tail of open-but-abandoned
 * events entirely -- which is why `backlog` exists.
 *
 * `backlog` issues the naive request: `status=open` with no date bound. That is what you
 * get by reaching for the documented default, and it is mostly events nobody has
 * observed in over a year. The app exposes it so that failure mode is visible rather
 * than theoretical.
 */
export function fetchEvents(window: Window, signal?: AbortSignal) {
  const query =
    window === 'backlog'
      ? `status=open&limit=${MAX_LIMIT}`
      : `status=all&limit=${MAX_LIMIT}&days=${window}`
  return get<{ events: EonetEvent[] }>(`/events?${query}`, signal).then((d) => d.events)
}
