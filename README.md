# EONET Explorer

An interactive explorer for [NASA's EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) natural
event feed, built around a single premise: **the field that tells you whether something is
happening is not the one the API makes obvious.**

## Running it

Requires Node 20.19+ or 22.12+.

```bash
npm install && npm run dev
```

Then open http://localhost:5173. There is no backend, no API key and no `.env` — EONET
serves `Access-Control-Allow-Origin: *`, so the browser talks to it directly.

To build for production:

```bash
npm run build && npm run preview
```

### Checks

```bash
npm test && npm run lint && npm run typecheck && npm run format:check
```

Tests are Vitest, covering `src/lib/events.ts` — the freshness derivation, geometry
conversion and formatting, which is where all the real logic lives. The freshness
boundaries are pinned exactly, since they are the app's central claim. Everything else in
the codebase is either presentational or a thin wrapper over `fetch`.

`npm run test:watch` reruns on change.

ESLint runs flat config with `typescript-eslint`'s **type-aware** rules plus the React Hooks
and React Refresh plugins; `eslint-config-prettier` sits last so formatting is Prettier's
job alone. Prettier is configured to match the existing style (no semicolons, single quotes,
90 columns) and sorts Tailwind classes via `prettier-plugin-tailwindcss`. `npm run format`
rewrites in place.

## What I learned about the data

I pulled the API apart before designing anything. The findings drove every subsequent
choice:

**`status` defaults to `open`, and `open` does not mean "happening".** An event stays open
until a reporting source files a closing report, and many never get one. Of the ~5,000 open
events the default request returns, **68% have not been observed in over a year** (median
staleness: 543 days). The obvious first API call therefore returns a mound of abandoned
records _and_ hides every event that properly ended.

**`days=N` cannot show you this.** The date filter applies to the event date, so any bounded
window excludes the stale tail by construction. That is why the app has a deliberate **"Open
backlog"** mode that reproduces the naive `GET /events` request — the failure mode is
demonstrable in the UI rather than described in a footnote.

**Wildfires are ~93% of any recent window.** Volcanoes, sea ice and severe storms are
rounding errors by count and are usually the more interesting things to look at.

**Some events are paths, not points.** A tropical cyclone is an ordered series of 6-hourly
fixes with wind speed attached. Rendering one pin per event discards the entire story of an
event that intensified from 35 kts to 115 kts.

**Coordinate order is not consistent across the feed.** Point geometries follow the GeoJSON
convention of `[lon, lat]`. The flood polygons GDACS supplies do not — they arrive as
`[lat, lon]`. Across every sample I pulled, 41,357 polygon vertices proved to be `[lat, lon]`
(their second value exceeds the ±90 latitude range, so it can only be a longitude) and not
one proved otherwise; 788 point vertices proved the opposite. Read a flood polygon the
standard way and it lands on the wrong continent — "Flood in Sudan" renders in Libya, about
1,000 km off. The app detects the order per geometry rather than assuming either.

**Magnitudes are not comparable across events.** Fire size arrives in _acres_ from some
sources and _hectares_ from others; storms in _kts_; sea ice in _NM^2_. Nothing is
normalised.

**The metadata is thin.** ~87% of events have a null `description`. Titles are the only real
descriptive field, and there is no severity ranking or impact data of any kind.

## Design decisions

**Freshness replaces status as the organising concept.** Every event is bucketed by time
since its _last observation_ — Active (≤7d), Recent (8–30d), Stale (1–12mo), Dormant
(>1yr, still open), Closed. This is the honest signal, so it drives the colour, the opacity,
the sort order and the default filter.

**Dormant events are hidden by default, visibly.** They are the majority of the raw feed and
leaving them on makes the map read as though half the planet is on fire. The filter chip
shows the count and is one click away, so the omission is never silent.

**Tracks are drawn as tracks.** Multi-geometry events render as paths with an emphasised
endpoint, and the detail panel plots magnitude over the event's life.

**Filter counts are cross-filtered.** Each chip's number reflects every _other_ active
filter, so it tells you what you'd actually get by clicking it — that is also how the
93%-wildfires skew becomes obvious without a chart.

**The timeline is a histogram and a brush.** Bars are stacked by freshness, so the shape of
the staleness problem is visible before you filter anything. Drag across it to narrow by
date.

**Truncation is surfaced, not swallowed.** The API caps responses at 5,000 events; when a
window hits that ceiling the app says so rather than quietly showing a partial map.

## What I'd do with more time

- **Server-side aggregation.** Everything is client-side against a 5,000-event cap. A thin
  proxy that paginated and cached would remove the ceiling and cut the ~10s load on the
  widest windows.
- **Clustering at low zoom.** 5,000 canvas markers render fine but overlap badly; a
  supercluster layer would make dense regions readable.
- **Animate tracks through time.** A scrubber that plays a cyclone along its path is the
  natural extension of the per-event timeline.
- **URL-encoded state**, so a particular view can be shared or linked.
- **Reconcile against the `layers` endpoint**, which I did not explore — it exposes matching
  satellite imagery layers per category and would give events visual context.
- **Wider test coverage.** `src/lib/events.ts` is covered; the components are not. The
  timeline's binning and brush arithmetic is the next thing I'd pin down.

## Structure

```
src/
  api/eonet.ts        API types and the two request shapes (windowed vs. backlog)
  lib/events.ts       Freshness derivation, geometry helpers, formatting
  lib/events.test.ts  Unit tests for the above
  lib/categories.ts   Category palette
  components/
    MapView.tsx       Leaflet map: points, tracks, polygons
    FilterPanel.tsx   Window, freshness, category, search
    EventList.tsx     Result list, linked to map selection
    EventDetail.tsx   Detail panel, magnitude sparkline, observation log
    Timeline.tsx      Stacked histogram + drag-to-brush date filter
    DataNotes.tsx     In-app dataset primer, computed from live data
    MapLoadingOverlay.tsx  Non-blocking spinner shown while a window is in flight
```

Built with Vite, React, TypeScript, Leaflet, TanStack Query and Tailwind. Basemap tiles from
CARTO/OpenStreetMap (keyless).
