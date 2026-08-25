import { describe, expect, it } from 'vitest'
import type { EonetEvent, EonetGeometry } from '../api/eonet'
import {
  deriveEvent,
  formatAge,
  formatDate,
  formatMagnitude,
  FRESHNESS_META,
  FRESHNESS_ORDER,
} from './events'

const DAY = 86_400_000
const NOW = Date.parse('2026-08-25T12:00:00Z')

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString()
}

function point(
  date: string,
  opts: { lon?: number; lat?: number; mag?: number | null; unit?: string | null } = {},
): EonetGeometry {
  return {
    date,
    type: 'Point',
    coordinates: [opts.lon ?? 10, opts.lat ?? 20],
    magnitudeValue: opts.mag ?? null,
    magnitudeUnit: opts.unit ?? null,
  }
}

/** `ring` is given as [lon, lat] pairs, matching the wire format. */
function polygon(date: string, ring: [number, number][]): EonetGeometry {
  return {
    date,
    type: 'Polygon',
    coordinates: [ring],
    magnitudeValue: null,
    magnitudeUnit: null,
  }
}

function event(overrides: Partial<EonetEvent> = {}): EonetEvent {
  return {
    id: 'EONET_1',
    title: 'Test event',
    description: null,
    link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1',
    closed: null,
    categories: [{ id: 'wildfires', title: 'Wildfires' }],
    sources: [{ id: 'IRWIN', url: 'https://example.test/1' }],
    geometry: [point(daysAgo(1))],
    ...overrides,
  }
}

/** deriveEvent returns null for unusable events; most tests need the non-null value. */
function derive(raw: EonetEvent, now = NOW) {
  const derived = deriveEvent(raw, now)
  if (!derived) throw new Error('expected deriveEvent to return an event')
  return derived
}

describe('deriveEvent: rejecting unusable events', () => {
  it('returns null when the event carries no geometry at all', () => {
    expect(deriveEvent(event({ geometry: [] }), NOW)).toBeNull()
  })

  it('returns null when every geometry date is unparseable', () => {
    expect(deriveEvent(event({ geometry: [point('not-a-date')] }), NOW)).toBeNull()
  })

  it('returns null when no geometry yields renderable coordinates', () => {
    // The API is external, so coordinates are validated rather than trusted.
    const junk = {
      date: daysAgo(1),
      type: 'Point',
      coordinates: ['12.3', null],
    } as unknown as EonetGeometry
    expect(deriveEvent(event({ geometry: [junk] }), NOW)).toBeNull()
  })

  it('returns null when coordinates are numeric but not finite', () => {
    expect(
      deriveEvent(event({ geometry: [point(daysAgo(1), { lon: NaN })] }), NOW),
    ).toBeNull()
  })
})

describe('deriveEvent: observation window', () => {
  it('orders the track oldest-first regardless of input order', () => {
    const derived = derive(
      event({ geometry: [point(daysAgo(1)), point(daysAgo(9)), point(daysAgo(5))] }),
    )
    expect(derived.track.map((g) => g.date)).toEqual([daysAgo(9), daysAgo(5), daysAgo(1)])
    expect(derived.firstObserved).toBe(Date.parse(daysAgo(9)))
    expect(derived.lastObserved).toBe(Date.parse(daysAgo(1)))
  })

  it('drops geometries with unparseable dates but keeps the valid ones', () => {
    const derived = derive(
      event({ geometry: [point(daysAgo(3)), point('garbage'), point(daysAgo(1))] }),
    )
    expect(derived.track).toHaveLength(2)
    expect(derived.lastObserved).toBe(Date.parse(daysAgo(1)))
  })

  it('marks multi-geometry events as tracks and single observations as not', () => {
    expect(derive(event()).isTrack).toBe(false)
    expect(
      derive(event({ geometry: [point(daysAgo(2)), point(daysAgo(1))] })).isTrack,
    ).toBe(true)
  })
})

describe('deriveEvent: freshness', () => {
  // The boundaries are the whole thesis of the app, so they are pinned exactly.
  it.each([
    [0, 'active'],
    [7, 'active'],
    [8, 'recent'],
    [30, 'recent'],
    [31, 'stale'],
    [365, 'stale'],
    [366, 'dormant'],
    [800, 'dormant'],
  ])('an event last seen %i days ago is %s', (age, expected) => {
    const derived = derive(event({ geometry: [point(daysAgo(age))] }))
    expect(derived.ageDays).toBe(age)
    expect(derived.freshness).toBe(expected)
  })

  it('treats a closed event as closed however recently it was observed', () => {
    const derived = derive(
      event({ closed: '2026-08-24T00:00:00Z', geometry: [point(daysAgo(0))] }),
    )
    expect(derived.freshness).toBe('closed')
  })

  it('treats a closed event as closed however stale it is', () => {
    const derived = derive(
      event({ closed: '2024-01-01T00:00:00Z', geometry: [point(daysAgo(900))] }),
    )
    expect(derived.freshness).toBe('closed')
  })

  it('clamps observations dated in the future to zero days old', () => {
    const derived = derive(event({ geometry: [point(daysAgo(-5))] }))
    expect(derived.ageDays).toBe(0)
    expect(derived.freshness).toBe('active')
  })

  it('measures age against the supplied reference time, not the clock', () => {
    const raw = event({ geometry: [point(daysAgo(10))] })
    expect(derive(raw, NOW).ageDays).toBe(10)
    expect(derive(raw, NOW + 5 * DAY).ageDays).toBe(15)
  })
})

describe('deriveEvent: geometry conversion', () => {
  it('flips wire-format [lon, lat] into Leaflet [lat, lng]', () => {
    const derived = derive(
      event({ geometry: [point(daysAgo(1), { lon: -101.217, lat: 35.4635 })] }),
    )
    expect(derived.points).toEqual([[35.4635, -101.217]])
  })

  it('keeps polygon-only events, which is how sea and lake ice arrives', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ]
    const derived = derive(event({ geometry: [polygon(daysAgo(1), ring)] }))
    expect(derived.points).toEqual([])
    expect(derived.polygons).toEqual([
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
    ])
  })

  it('drops polygon rings left with fewer than three valid vertices', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 1],
    ]
    // Only a two-vertex ring, so nothing renderable survives.
    expect(deriveEvent(event({ geometry: [polygon(daysAgo(1), ring)] }), NOW)).toBeNull()
  })
})

describe('deriveEvent: magnitude', () => {
  it('reports the highest magnitude with its unit attached', () => {
    const derived = derive(
      event({
        geometry: [
          point(daysAgo(3), { mag: 35, unit: 'kts' }),
          point(daysAgo(2), { mag: 115, unit: 'kts' }),
          point(daysAgo(1), { mag: 95, unit: 'kts' }),
        ],
      }),
    )
    expect(derived.peakMagnitude).toEqual({ value: 115, unit: 'kts' })
  })

  it('is null when nothing in the track carries a magnitude', () => {
    expect(derive(event()).peakMagnitude).toBeNull()
  })

  it('ignores magnitude values that arrive without a unit', () => {
    const derived = derive(
      event({ geometry: [point(daysAgo(1), { mag: 500, unit: null })] }),
    )
    expect(derived.peakMagnitude).toBeNull()
  })

  it('ignores non-finite magnitude values', () => {
    const derived = derive(
      event({
        geometry: [
          point(daysAgo(2), { mag: Number.NaN, unit: 'acres' }),
          point(daysAgo(1), { mag: 40, unit: 'acres' }),
        ],
      }),
    )
    expect(derived.peakMagnitude).toEqual({ value: 40, unit: 'acres' })
  })
})

describe('deriveEvent: category fallback', () => {
  it('uses the first category when one is present', () => {
    const derived = derive(event())
    expect(derived.categoryId).toBe('wildfires')
    expect(derived.categoryTitle).toBe('Wildfires')
  })

  it('falls back when the categories array is empty', () => {
    const derived = derive(event({ categories: [] }))
    expect(derived.categoryId).toBe('unknown')
    expect(derived.categoryTitle).toBe('Uncategorised')
  })
})

describe('formatAge', () => {
  it.each([
    [0, 'today'],
    [-3, 'today'],
    [1, '1 day ago'],
    [2, '2 days ago'],
    [44, '44 days ago'],
    [45, '2 months ago'],
    [545, '18 months ago'],
  ])('formats %i days as "%s"', (days, expected) => {
    expect(formatAge(days)).toBe(expected)
  })

  it('switches to years once the gap reaches two', () => {
    expect(formatAge(730)).toBe('2.0 years ago')
  })
})

describe('formatMagnitude', () => {
  it('leaves small values untouched and appends the unit', () => {
    expect(formatMagnitude(676, 'acres')).toBe('676 acres')
    expect(formatMagnitude(0.5, 'acres')).toBe('0.5 acres')
  })

  it('rounds and group-separates values of a thousand or more', () => {
    // Asserted loosely on the separator so the test is not locale-dependent.
    expect(formatMagnitude(1300.6, 'hectare')).toMatch(/^1\D?301 hectare$/)
  })
})

describe('formatDate', () => {
  it('renders a UTC timestamp to the minute', () => {
    expect(formatDate(Date.parse('2026-08-24T20:38:00Z'))).toBe('2026-08-24 20:38Z')
  })
})

describe('freshness metadata', () => {
  it('keeps FRESHNESS_ORDER in step with FRESHNESS_META', () => {
    expect([...FRESHNESS_ORDER].sort()).toEqual(Object.keys(FRESHNESS_META).sort())
  })
})
