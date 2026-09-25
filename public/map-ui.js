const PORT = { name: 'Hamad Port', point: [25.029967, 51.593342] };
// Hamad Port reference coordinates are taken from Mwani Qatar's port regulations.
// The destination and intermediate route points below are deliberately simulated.
const DESTINATION = { name: 'Simulated distribution point · Doha area', point: [25.2865, 51.533] };
const ROUTE_PATH = [
  PORT.point,
  [25.09, 51.574],
  [25.16, 51.558],
  [25.22, 51.545],
  DESTINATION.point
];
const ROUTE_STAGES = [
  { label: 'Hamad Port', progress: 0 },
  { label: 'Port handoff · simulated', progress: 0.17 },
  { label: 'Customs / staging · simulated', progress: 0.4 },
  { label: 'Reefer transit · simulated', progress: 0.7 },
  { label: 'Simulated Doha distribution point', progress: 1 }
];
const TILE_URL = window.CCG_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatHours(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)} h` : '—';
}

function statusKind(status) {
  return ({ HEALTHY: 'normal', WATCH: 'watch', 'AT RISK': 'risk', CRITICAL: 'critical' })[String(status).toUpperCase()] || 'watch';
}

function statusText(status) {
  return ({ HEALTHY: 'NORMAL', WATCH: 'WATCH', 'AT RISK': 'AT RISK', CRITICAL: 'HIGH ATTENTION' })[String(status).toUpperCase()] || 'WATCH';
}

function statusMark(status) {
  return ({ HEALTHY: '✓', WATCH: '•', 'AT RISK': '!', CRITICAL: '!!' })[String(status).toUpperCase()] || '•';
}

function interpolatePath(progress) {
  const ratio = Math.max(0, Math.min(1, finite(progress)));
  const lengths = [];
  let total = 0;
  for (let index = 1; index < ROUTE_PATH.length; index += 1) {
    const previous = ROUTE_PATH[index - 1];
    const current = ROUTE_PATH[index];
    const dx = (current[1] - previous[1]) * Math.cos((current[0] + previous[0]) * Math.PI / 360);
    const dy = current[0] - previous[0];
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    total += length;
  }
  let remaining = ratio * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const fraction = length ? remaining / length : 0;
      const start = ROUTE_PATH[index];
      const end = ROUTE_PATH[index + 1];
      return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
    }
    remaining -= length;
  }
  return [...DESTINATION.point];
}

function positionOnRoute(progress, lateralOffsetMeters = 0) {
  const point = interpolatePath(progress);
  if (!lateralOffsetMeters) return point;
  const before = interpolatePath(Math.max(0, progress - 0.012));
  const after = interpolatePath(Math.min(1, progress + 0.012));
  const latitudeScale = Math.cos(point[0] * Math.PI / 180);
  const dx = (after[1] - before[1]) * latitudeScale;
  const dy = after[0] - before[0];
  const length = Math.hypot(dx, dy) || 1;
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  return [
    point[0] + perpendicularY * lateralOffsetMeters / 111320,
    point[1] + perpendicularX * lateralOffsetMeters / (111320 * latitudeScale)
  ];
}

function makeIcon(className, symbol, label, offset = { x: 0, y: 0 }) {
  const iconName = className.split(' ')[0];
  const size = className.includes('shipment') ? [36, 36] : [34, 38];
  const anchor = [size[0] / 2 - offset.x, size[1] / 2 - offset.y];
  return L.divIcon({
    className,
    html: `<span class="${iconName}__body" aria-label="${escapeHtml(label)}">${escapeHtml(symbol)}</span>`,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, className.includes('shipment') ? -17 : -30]
  });
}

function fanOffset(index, count, radius = 42) {
  if (count <= 1) return { x: 0, y: 0 };
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

function mapProgress(shipment) {
  const elapsed = Math.max(0, finite(shipment.elapsedHours));
  const eta = Math.max(0, finite(shipment.etaHours));
  return Math.max(0.04, Math.min(0.96, elapsed / Math.max(0.25, elapsed + eta)));
}

function shipmentPopup(shipment, { showInspectButton = true } = {}) {
  const kind = statusKind(shipment.status);
  const quality = shipment.qualityState || {};
  const event = shipment.mapEvent;
  const recommendation = shipment.recommendation?.action || shipment.recommendation || 'INSPECT';
  const temperature = shipment.currentTemperatureC;
  const temperatureLabel = temperature !== null && temperature !== undefined && Number.isFinite(Number(temperature))
    ? `${Number(temperature).toFixed(1)}°C`
    : '—';
  const positionNote = shipment.source === 'SIMULATED'
    ? 'Simulated position by trip progress · not GPS'
    : 'User-supplied position · ground truth not verified';
  return `<section class="map-shipment-popup">
    <header class="map-popup-heading"><div><strong>${escapeHtml(shipment.id)}</strong><small>${escapeHtml(shipment.productName || shipment.productId || 'Product unavailable')}</small></div><span class="map-status-pill is-${kind}"><b>${statusMark(shipment.status)}</b>${statusText(shipment.status)}</span></header>
    ${event ? `<p class="map-popup-event"><b>⚠</b> ${escapeHtml(String(event.type || 'event').replaceAll('_', ' ').toLowerCase())} · around trip hour ${formatHours(event.startHour, 1)}</p>` : ''}
    <dl class="map-popup-metrics"><div><dt>Current temperature</dt><dd>${temperatureLabel}</dd></div><div><dt>Quality Debt</dt><dd>+${formatHours(quality.qualityDebtHours)}</dd></div><div><dt>Remaining life · p50</dt><dd>${formatHours(quality.rsl_p50_hours, 0)}</dd></div><div><dt>ETA</dt><dd>${formatHours(shipment.etaHours)}</dd></div><div><dt>Arrival margin · p50</dt><dd>${formatHours(quality.arrivalMarginHours)}</dd></div><div><dt>Suggested action</dt><dd>${escapeHtml(String(recommendation).replaceAll('_', ' ').toLowerCase())}</dd></div></dl>
    ${showInspectButton ? `<button class="button button-primary map-popup-action" type="button" data-open-shipment="${escapeHtml(shipment.id)}">Inspect shipment <span aria-hidden="true">→</span></button>` : ''}
    <small class="map-popup-foot">${escapeHtml(positionNote)}</small>
  </section>`;
}

function pointPopup(title, description, label) {
  return `<section class="map-point-popup"><span class="map-point-kicker">${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></section>`;
}

function createOfflineBase() {
  const local = L.layerGroup();
  const qatarLand = [
    [25.46, 51.34], [25.46, 51.47], [25.42, 51.53], [25.36, 51.58],
    [25.29, 51.615], [25.22, 51.64], [25.14, 51.67], [25.04, 51.70],
    [24.96, 51.72], [24.92, 51.34]
  ];
  L.polygon(qatarLand, { color: '#c5d9db', weight: 1.2, fillColor: '#e8f0e9', fillOpacity: 0.9, interactive: false }).addTo(local);
  L.polyline([[25.4, 51.41], [25.31, 51.45], [25.22, 51.49], [25.1, 51.52], [24.98, 51.57]], { color: '#fff', weight: 2, opacity: 0.75, interactive: false }).addTo(local);
  L.marker([25.285, 51.533], {
    icon: L.divIcon({ className: 'map-city-label-host', html: '<span class="map-city-label">DOHA · APPROXIMATE</span>', iconSize: [120, 18], iconAnchor: [60, 9] }),
    interactive: false
  }).addTo(local);
  return local;
}

function attachBaseLayers(map, container, useOnlineTiles) {
  const schematic = createOfflineBase();
  const layers = { 'Offline schematic': schematic };
  let tiles = null;
  let timeout = null;
  let tileLoads = 0;
  let tileErrors = 0;
  let userChangedLayer = false;
  const status = container.closest('.map-card-content, .sim-map-content')?.querySelector('[data-map-status]');
  const setStatus = (message) => { if (status) status.textContent = message; };

  if (useOnlineTiles) {
    tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
      updateWhenIdle: true,
      keepBuffer: 1
    });
    layers['OpenStreetMap · online'] = tiles;
    tiles.on('tileload', () => {
      tileLoads += 1;
      setStatus('Street basemap · OpenStreetMap');
      if (timeout) { clearTimeout(timeout); timeout = null; }
    });
    tiles.on('tileerror', () => {
      tileErrors += 1;
      if (!tileLoads) setStatus('Loading street basemap…');
    });
    tiles.addTo(map);
    setStatus('Loading street basemap…');
    timeout = setTimeout(() => {
      if (!tileLoads && !userChangedLayer && map.hasLayer(tiles)) {
        map.removeLayer(tiles);
        schematic.addTo(map);
        setStatus('Offline schematic · route tools still work');
      }
    }, 5200);
  } else {
    schematic.addTo(map);
    setStatus('Offline schematic · route tools still work');
  }

  if (tiles) L.control.layers(layers, null, { collapsed: true, position: 'topright' }).addTo(map);
  map.on('baselayerchange', (event) => {
    userChangedLayer = true;
    if (timeout) { clearTimeout(timeout); timeout = null; }
    setStatus(event.layer === schematic ? 'Offline schematic · route tools still work' : 'Street basemap · OpenStreetMap');
  });
  return () => { if (timeout) clearTimeout(timeout); };
}

function drawRoute(map) {
  const latlngs = ROUTE_PATH.map(([lat, lon]) => [lat, lon]);
  L.polyline(latlngs, { color: '#fff', weight: 14, opacity: 0.98, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
  const line = L.polyline(latlngs, { color: '#126e8b', weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  line.bindTooltip('Illustrative corridor · not a road route or commercial shipment track', { sticky: true, className: 'map-tooltip' });

  ROUTE_STAGES.forEach((stage, index) => {
    if (index === 0 || index === ROUTE_STAGES.length - 1) return;
    L.circleMarker(positionOnRoute(stage.progress), {
      radius: 5, color: '#fff', weight: 2, fillColor: '#168aad', fillOpacity: 1,
      bubblingMouseEvents: false
    }).addTo(map).bindTooltip(`${stage.label} · illustrative route point`, { direction: 'top', className: 'map-tooltip' });
  });

  const origin = L.marker(PORT.point, { icon: makeIcon('map-location-origin', '◆', 'Origin · Hamad Port'), title: 'Origin · Hamad Port' }).addTo(map);
  origin.bindTooltip('ORIGIN · HAMAD PORT', { direction: 'top', className: 'map-tooltip' });
  origin.bindPopup(pointPopup('Hamad Port', 'Real named origin point for this generated demo corridor. It does not identify an actual shipment.', 'Origin · SIMULATED ROUTE'));

  const destination = L.marker(DESTINATION.point, { icon: makeIcon('map-location-destination', '◆', 'Destination · simulated Doha point'), title: 'Destination · simulated Doha point' }).addTo(map);
  destination.bindTooltip('DESTINATION · SIMULATED DOHA POINT', { direction: 'top', className: 'map-tooltip' });
  destination.bindPopup(pointPopup('Simulated Doha distribution point', 'Approximate point in the Doha area for the demo. It is not a named warehouse or a real customer location.', 'Destination · SIMULATED ROUTE'));
}

function makeMap(container, { useOnlineTiles = true } = {}) {
  if (!window.L || !container) return null;
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: true,
    zoomSnap: 0.5,
    minZoom: 6,
    maxZoom: 17,
    preferCanvas: true
  });
  map.fitBounds(L.latLngBounds(ROUTE_PATH).pad(0.22), { maxZoom: 11 });
  L.control.zoom({ position: 'topright' }).addTo(map);
  const stopBaseTimer = attachBaseLayers(map, container, useOnlineTiles);
  drawRoute(map);
  setTimeout(() => map.invalidateSize({ pan: false }), 0);
  return { map, destroy: () => { stopBaseTimer(); map.remove(); } };
}

function focusMap(map, point, zoom = 10) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) map.setView(point, zoom, { animate: false });
  else map.flyTo(point, zoom, { duration: 0.55, easeLinearity: 0.25 });
}

export function mountFleetMap(container, { shipments, selectedId, onSelectionChange } = {}) {
  const session = makeMap(container, { useOnlineTiles: true });
  if (!session) return { focusShipment() {}, destroy() {} };
  const { map } = session;
  const markers = new Map();
  const eventLayers = [];
  const simulated = (shipments || []).filter((shipment) => shipment.source === 'SIMULATED');
  const userLocated = (shipments || []).filter((shipment) => shipment.source !== 'SIMULATED' && shipment.mapCoordinate);

  function select(id, openPopup = false) {
    selectedId = id;
    for (const [shipmentId, marker] of markers) marker.getElement()?.classList.toggle('is-selected', shipmentId === selectedId);
    onSelectionChange?.(id);
    const marker = markers.get(id);
    if (!marker) return;
    if (openPopup) {
      focusMap(map, marker.getLatLng(), Math.max(map.getZoom(), 9.5));
      marker.openPopup();
    }
  }

  simulated.forEach((shipment, index) => {
    const basePoint = positionOnRoute(mapProgress(shipment));
    const icon = makeIcon(`ccg-shipment-marker is-${statusKind(shipment.status)}`, statusMark(shipment.status), `${statusText(shipment.status)} shipment ${shipment.id}`, fanOffset(index, simulated.length));
    const marker = L.marker(basePoint, { icon, title: `${shipment.id} · ${statusText(shipment.status)}`, keyboard: true, riseOnHover: true }).addTo(map);
    marker.bindTooltip(`<strong>${escapeHtml(shipment.id)}</strong> · ${statusText(shipment.status)} · trip-progress position`, { direction: 'top', sticky: true, className: 'map-tooltip' });
    marker.bindPopup(shipmentPopup(shipment), { maxWidth: 300, minWidth: 260, className: 'ccg-map-popup', closeButton: true, autoPanPadding: [14, 14] });
    marker.on('click', () => select(shipment.id));
    markers.set(shipment.id, marker);

    const event = shipment.mapEvent;
    if (event) {
      const tripHours = Math.max(0.25, finite(shipment.elapsedHours) + finite(shipment.etaHours));
      const eventProgress = Math.max(0.04, Math.min(0.94, (finite(event.startHour) + finite(event.endHour, event.startHour)) / 2 / tripHours));
      const eventLabel = String(event.type || 'temperature event').replaceAll('_', ' ').toLowerCase();
      const eventMarker = L.marker(positionOnRoute(eventProgress), {
        icon: makeIcon('ccg-event-marker', '⚠', `Simulated event · ${eventLabel}`, { x: ((index % 3) - 1) * 18, y: 22 }),
        title: `Simulated event · ${eventLabel}`,
        keyboard: true,
        zIndexOffset: 900
      }).addTo(map);
      eventMarker.bindTooltip(`⚠ ${escapeHtml(eventLabel)} · about trip hour ${finite(event.startHour).toFixed(1)}`, { direction: 'top', sticky: true, className: 'map-tooltip map-tooltip-event' });
      eventMarker.bindPopup(`<section class="map-point-popup"><span class="map-point-kicker">SIMULATED EVENT MARKER</span><strong>⚠ ${escapeHtml(eventLabel)}</strong><p>Approximate route position based on event time; this is not GPS.</p><button class="button button-primary map-popup-action" data-open-shipment="${escapeHtml(shipment.id)}">Inspect ${escapeHtml(shipment.id)} →</button></section>`, { maxWidth: 260, className: 'ccg-map-popup' });
      eventLayers.push(eventMarker);
    }
  });

  userLocated.forEach((shipment) => {
    const coordinate = shipment.mapCoordinate;
    const icon = makeIcon(`ccg-shipment-marker is-${statusKind(shipment.status)} is-user-point`, 'GPS', `User-supplied location for ${shipment.id}`);
    const marker = L.marker([coordinate.latitude, coordinate.longitude], { icon, title: `${shipment.id} · last user-supplied GPS point`, keyboard: true, riseOnHover: true }).addTo(map);
    marker.bindTooltip(`<strong>${escapeHtml(shipment.id)}</strong> · last user-supplied point · not verified`, { direction: 'top', sticky: true, className: 'map-tooltip' });
    marker.bindPopup(shipmentPopup({ ...shipment, mapEvent: null }), { maxWidth: 300, minWidth: 260, className: 'ccg-map-popup' });
    marker.on('click', () => select(shipment.id));
    markers.set(shipment.id, marker);
  });

  function focusShipment(id) {
    if (markers.has(id)) select(id, true);
  }
  if (selectedId && markers.has(selectedId)) select(selectedId, false);

  return {
    ...session,
    focusShipment,
    destroy() { eventLayers.length = 0; session.destroy(); }
  };
}

export function mountSimulationMap(container, shipment, controls = {}) {
  const session = makeMap(container, { useOnlineTiles: false });
  if (!session) return { toggleAnimation() {}, restartAnimation() {}, destroy() {} };
  const { map } = session;
  const elapsed = Math.max(0, finite(shipment.elapsedHours));
  const eta = Math.max(0, finite(shipment.etaHours));
  const targetProgress = Math.max(0.08, Math.min(0.92, elapsed / Math.max(0.25, elapsed + eta)));
  let progress = 0;
  let animationFrame = 0;
  let animationStart = 0;
  let startProgress = 0;
  let isAnimating = false;
  let destroyed = false;
  const event = shipment.events?.find((candidate) => Number.isFinite(candidate.startHour) && candidate.startHour <= elapsed) ?? null;
  const currentReadings = Object.values(shipment.samples?.at(-1)?.temperaturesC ?? {}).filter(Number.isFinite).sort((a, b) => a - b);
  const currentTemperatureC = currentReadings.length ? currentReadings[Math.floor(currentReadings.length / 2)] : null;
  const eventLabel = event ? String(event.type).replaceAll('_', ' ').toLowerCase() : null;
  const marker = L.marker(PORT.point, {
    icon: makeIcon('ccg-shipment-marker is-simulation', '▣', 'Simulated shipment position · not GPS'),
    title: 'Simulated shipment position · no live GPS',
    keyboard: true,
    riseOnHover: true
  }).addTo(map);
  marker.bindTooltip('SIMULATED SHIPMENT · not GPS', { direction: 'top', sticky: true, className: 'map-tooltip' });
  marker.bindPopup(shipmentPopup({ ...shipment, source: 'SIMULATED', currentTemperatureC, mapEvent: event }, { showInspectButton: false }), {
    maxWidth: 300, minWidth: 260, className: 'ccg-map-popup', closeButton: true, autoPanPadding: [14, 14]
  });
  if (event) {
    const eventProgress = Math.max(0.04, Math.min(0.94, (finite(event.startHour) + finite(event.endHour, event.startHour)) / 2 / Math.max(0.25, elapsed + eta)));
    const eventMarker = L.marker(positionOnRoute(eventProgress), {
      icon: makeIcon('ccg-event-marker', '⚠', `Simulated event · ${eventLabel}`, { x: 0, y: -38 }),
      title: `Simulated event · ${eventLabel}`,
      keyboard: true,
      zIndexOffset: 900
    }).addTo(map);
    eventMarker.bindTooltip(`⚠ ${eventLabel} · about trip hour ${finite(event.startHour).toFixed(1)}`, { direction: 'top', sticky: true, className: 'map-tooltip map-tooltip-event' });
    eventMarker.bindPopup(pointPopup(`${eventLabel} · ${finite(event.startHour).toFixed(1)}–${finite(event.endHour).toFixed(1)} h`, `Heuristic event time, displayed at an approximate point along this synthetic route. Related shipment: ${shipment.id}. No live event location is available.`, `SIMULATED EVENT · ${shipment.id}`), { maxWidth: 260, className: 'ccg-map-popup' });
  }

  function setProgress(value) {
    progress = Math.max(0, Math.min(targetProgress, value));
    const point = positionOnRoute(progress);
    marker.setLatLng(point);
    marker.setTooltipContent(`SIMULATED SHIPMENT · ${Math.round(progress * 100)}% of illustrative route · not GPS`);
    if (controls.progressNode) controls.progressNode.textContent = `${Math.round(progress * 100)}% of illustrative trip`;
  }

  function setControlState(label, running) {
    if (controls.toggleButton) {
      controls.toggleButton.textContent = running ? 'Ⅱ Pause' : progress >= targetProgress ? '▶ Replay route' : '▶ Animate route';
      controls.toggleButton.setAttribute('aria-pressed', String(running));
    }
    if (controls.stateNode) controls.stateNode.textContent = label;
  }

  function frame(now) {
    if (destroyed || !isAnimating) return;
    const duration = 3100;
    const fraction = Math.min(1, (now - animationStart) / duration);
    const eased = fraction < 0.5 ? 4 * fraction ** 3 : 1 - (-2 * fraction + 2) ** 3 / 2;
    setProgress(startProgress + (targetProgress - startProgress) * eased);
    if (fraction < 1) animationFrame = requestAnimationFrame(frame);
    else {
      isAnimating = false;
      setControlState('Animation complete · simulated only', false);
    }
  }

  function toggleAnimation() {
    if (isAnimating) {
      isAnimating = false;
      cancelAnimationFrame(animationFrame);
      setControlState('Paused · simulated only', false);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setProgress(targetProgress);
      setControlState('Shown instantly · reduced motion · simulated only', false);
      return;
    }
    if (progress >= targetProgress) setProgress(0);
    isAnimating = true;
    startProgress = progress;
    animationStart = performance.now();
    setControlState('Moving · visual simulation only', true);
    animationFrame = requestAnimationFrame(frame);
  }

  function restartAnimation() {
    if (isAnimating) cancelAnimationFrame(animationFrame);
    isAnimating = false;
    setProgress(0);
    toggleAnimation();
  }

  setProgress(0);
  setControlState('Ready · visual simulation only', false);
  return {
    ...session,
    toggleAnimation,
    restartAnimation,
    destroy() {
      destroyed = true;
      isAnimating = false;
      cancelAnimationFrame(animationFrame);
      session.destroy();
    }
  };
}
