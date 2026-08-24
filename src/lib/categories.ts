/**
 * Colours for the 13 EONET categories. Wildfires are ~90% of any recent window, so the
 * palette deliberately gives the rare categories the loudest hues -- otherwise the map
 * reads as a single-colour fire map and everything else disappears.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  wildfires: '#f97316',
  severeStorms: '#a78bfa',
  volcanoes: '#ef4444',
  floods: '#38bdf8',
  seaLakeIce: '#67e8f9',
  earthquakes: '#fbbf24',
  landslides: '#a16207',
  drought: '#d97706',
  dustHaze: '#d6d3d1',
  snow: '#e0f2fe',
  tempExtremes: '#f472b6',
  manmade: '#64748b',
  waterColor: '#34d399',
}

export function categoryColor(id: string): string {
  return CATEGORY_COLORS[id] ?? '#94a3b8'
}
