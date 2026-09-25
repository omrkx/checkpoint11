# Interactive map implementation

## What the map shows

- The Overview map shows a generated Hamad Port–Doha corridor, with status-colored shipment markers, detected event markers, route milestones, and clickable origin/destination points.
- Seeded shipment positions are estimated from elapsed trip time and ETA. Nearby pins fan out visually so each remains clickable; the pin position is illustrative and is not a GPS fix or a real road route.
- A generic simulated delivery point is placed in the Doha area. It does not represent a named warehouse, customer, or commercial movement.
- If a user uploads GPS coordinates, the map can show the last supplied point. The marker is labeled user-supplied and unverified; no route is fabricated from missing coordinates.
- Simulation Lab has a separate map with optional play/pause/restart animation. It uses the same generated corridor and does not change model outputs.

## Open map background and offline behavior

Leaflet 1.9.4 is vendored locally under `public/vendor/leaflet/`, with its license and image assets. The map’s route, markers, pan/zoom, popups, and simulation animation run locally. The Overview may request only the currently viewed OpenStreetMap tiles; users can switch to the local schematic layer. No tile prefetch or offline tile download is included. The tile URL can be overridden with `window.CCG_MAP_TILE_URL` if a deployment selects a compatible provider and updates its content-security policy.

The standard OpenStreetMap raster tile service is best-effort and has no availability guarantee. Its tiles are an optional background; the app automatically falls back to a local schematic layer when the initial tile view cannot load. The schematic has no street or facility data. Tile attribution remains visible when OpenStreetMap is selected.

The server permits OpenStreetMap tile images in its content-security policy and uses `strict-origin-when-cross-origin` so the browser sends the referrer required by the tile policy. Normal browser caching is retained. No paid map API key or third-party JavaScript download is needed at runtime.

## Location provenance

The Hamad Port origin coordinate uses the port coordinate listed in [Mwani Qatar's Port Regulations](https://www.mwani.com.qa/Arabic/AboutUs/SiteAssets/pages/qatarportsregulations/Mwani%20Qatar%20Ports%20Regulations.pdf). The simulated Doha point and intermediate line points are approximate display geometry only. They do not encode a road route or a real cold-store location.

OpenStreetMap map tiles are attributed on-map as required by the [OpenStreetMap copyright notice](https://www.openstreetmap.org/copyright). Tile access follows the [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/): request visible tiles through the standard HTTPS endpoint, honor browser caching, do not prefetch tiles, and do not claim offline map tiles.

## Interaction coverage

- Mouse drag and touch drag pan the map; wheel and zoom controls change zoom.
- Route milestones, origin, destination, shipments, and event points expose hover labels; event points also explain the approximate event time when clicked.
- Clicking a shipment opens a compact card with product, status, current temperature, Quality Debt, p50 RSL, ETA, arrival margin, and suggested action.
- The card opens the full shipment passport.
- The Overview watchlist’s **Map** action pans to and selects the matching marker.
- Map marker selection highlights the matching watchlist row.
- Simulation animation is an explicit user action, lasts about three seconds, supports pause/resume and restart, and respects reduced-motion preferences.
- Temperature chart points and shaded excursions expose time, sensor temperature, and event status through native SVG hover/focus tooltips.

## Local assets

- `public/map-ui.js` — Leaflet setup, route points, layers, markers, popups, map selection, and animation.
- `public/vendor/leaflet/` — locally served Leaflet library, CSS, assets, and license.
- `public/styles.css` — map theme, marker states, popups, responsive layout, and chart hover styling.
- `src/engine.mjs` — summary fields for current temperature, detected event, elapsed time, and last user-supplied GPS point.
