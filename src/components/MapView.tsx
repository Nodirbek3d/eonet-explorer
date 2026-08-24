import { Fragment, useEffect, useMemo } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Polygon,
  useMap,
} from 'react-leaflet'
import type { DerivedEvent } from '../lib/events'
import { polygonLatLngs, toLatLng } from '../lib/events'
import { categoryColor } from '../lib/categories'

interface Props {
  events: DerivedEvent[]
  selected: DerivedEvent | null
  onSelect: (e: DerivedEvent | null) => void
}

/** Older observations fade out, so a busy map still reads as "what is happening now". */
function opacityFor(ageDays: number): number {
  if (ageDays <= 7) return 0.95
  if (ageDays <= 30) return 0.75
  if (ageDays <= 365) return 0.45
  return 0.25
}

function FlyToSelected({ selected }: { selected: DerivedEvent | null }) {
  const map = useMap()
  useEffect(() => {
    if (!selected) return
    const pts = selected.track.map(toLatLng).filter(Boolean) as [number, number][]
    if (!pts.length) return
    if (pts.length === 1) {
      map.flyTo(pts[0], Math.max(map.getZoom(), 5), { duration: 0.6 })
    } else {
      map.flyToBounds(pts, { padding: [60, 60], duration: 0.6 })
    }
  }, [selected, map])
  return null
}

export default function MapView({ events, selected, onSelect }: Props) {
  // Draw the selected event last so it is never buried under its neighbours.
  const ordered = useMemo(() => {
    if (!selected) return events
    return [...events.filter((e) => e.id !== selected.id), selected]
  }, [events, selected])

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      worldCopyJump
      preferCanvas
      className="h-full w-full"
      style={{ background: '#0b1017' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> &middot; Events: <a href="https://eonet.gsfc.nasa.gov/">NASA EONET</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      <FlyToSelected selected={selected} />

      {ordered.map((e) => {
        const color = categoryColor(e.categoryId)
        const isSel = selected?.id === e.id
        const opacity = isSel ? 1 : opacityFor(e.ageDays)
        const points = e.track.map(toLatLng).filter(Boolean) as [number, number][]
        const polygons = e.track.flatMap(polygonLatLngs)
        const last = points[points.length - 1]

        return (
          <Fragment key={e.id}>
            {/* Tracks: a storm is a path over time, not a single dot. */}
            {points.length > 1 && (
              <Polyline
                positions={points}
                pathOptions={{
                  color,
                  weight: isSel ? 3 : 1.5,
                  opacity: isSel ? 0.9 : 0.5,
                }}
                eventHandlers={{ click: () => onSelect(e) }}
              />
            )}

            {polygons.map((ring, i) => (
              <Polygon
                key={i}
                positions={ring}
                pathOptions={{
                  color,
                  weight: isSel ? 2 : 1,
                  opacity,
                  fillOpacity: opacity * 0.3,
                }}
                eventHandlers={{ click: () => onSelect(e) }}
              />
            ))}

            {last && (
              <CircleMarker
                center={last}
                radius={isSel ? 9 : e.isTrack ? 5 : 4}
                pathOptions={{
                  color: isSel ? '#ffffff' : color,
                  weight: isSel ? 2 : 1,
                  fillColor: color,
                  fillOpacity: opacity,
                  opacity,
                }}
                eventHandlers={{ click: () => onSelect(e) }}
              />
            )}
          </Fragment>
        )
      })}
    </MapContainer>
  )
}
