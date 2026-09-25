import { mountFleetMap, mountSimulationMap } from './map-ui.js';

const state = {
  view: 'overview',
  shipments: [],
  selectedMapShipmentId: null,
  fleet: null,
  products: [],
  evidence: [],
  selectedShipment: null,
  selectedEvidence: null,
  selectedEvidenceContent: null,
  evaluation: null,
  publicBenchmark: null,
  publicShipments: [],
  selectedPublicShipment: null,
  publicShipmentDetail: null,
  publicBenchmarkEvaluation: null,
  publicEvaluationBusy: false,
  fieldDataSamples: null,
  selectedFieldDataset: 'milk',
  evaluationFold: 'all',
  lastEvaluation: null,
  simulationResult: null,
  simulationCompare: null,
  isPlaying: false,
  simulationInput: {
    shipmentId: 'SIM-GCC-001', productId: 'strawberry', eventType: 'hot_handoff', eventOnsetHours: 4.5,
    eventDurationHours: 1.25, severity: 0.7, delayHours: 1, elapsedHours: 10.5, etaHours: 5,
    batchValueQar: 42000, inspectionCostQar: 180, rerouteCostQar: 950, expeditionCostQar: 520,
    selectedSensor: 'door', seed: 424242
  },
  loading: false
};

const SENSOR_ORDER = ['front', 'centre', 'rear', 'door'];
const SENSOR_LABELS = { front: 'Front pallet', centre: 'Centre pallet', rear: 'Rear pallet', door: 'Door-side pallet' };
const STATUS_CLASS = { HEALTHY: 'healthy', WATCH: 'watch', 'AT RISK': 'risk', CRITICAL: 'critical' };
const EVENT_LABELS = {
  COOLING_FAILURE: 'Cooling failure', DOOR_OPEN: 'Door excursion', HOT_HANDOFF: 'Hot handoff', DELAY: 'Route delay',
  SENSOR_DRIFT: 'Sensor drift', SENSOR_STUCK: 'Sensor stuck', SENSOR_DROPOUT: 'Sensor dropout', GPS_DROPOUT: 'GPS dropout',
  UNKNOWN_EXCURSION: 'Thermal excursion', PEER_DISAGREEMENT: 'Sensor disagreement'
};
const ROUTE_OPTIONS = [
  { label: 'Port handoff', hour: 2.2 }, { label: 'Customs / staging', hour: 4 },
  { label: 'Reefer truck', hour: 6.5 }, { label: 'DC receiving', hour: 10 }
];

const root = document.querySelector('#pageRoot');
const toastRegion = document.querySelector('#toastRegion');
let activeMap = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function api(route, options = {}) {
  const response = await fetch(route, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function postJson(route, data) {
  return api(route, { method: 'POST', body: JSON.stringify(data) });
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 4300);
}

function formatHours(value, precision = 0) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(precision)}` : '—';
}

function lowSideArrivalMargin(qualityState) {
  const rsl = Number(qualityState?.rsl_p10_hours);
  const eta = Number(qualityState?.etaHours);
  return Number.isFinite(rsl) && Number.isFinite(eta) ? rsl - eta : null;
}

function marginTone(value) {
  return value === null ? '' : value <= 0 ? 'is-negative' : value <= 18 ? 'is-tight' : '';
}

function formatQar(value) {
  return `QAR ${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
}

function formatClock(hour) {
  if (!Number.isFinite(Number(hour))) return '—';
  const total = Math.round(Number(hour) * 60);
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function statusBadge(status) {
  const label = String(status || 'WATCH').toUpperCase();
  const type = STATUS_CLASS[label] || 'neutral';
  const content = { HEALTHY: ['✓', 'NORMAL'], WATCH: ['•', 'WATCH'], 'AT RISK': ['!', 'AT RISK'], CRITICAL: ['!!', 'HIGH ATTENTION'] }[label] || ['•', label];
  return `<span class="badge badge-${type} status-badge"><b aria-hidden="true">${content[0]}</b>${escapeHtml(content[1])}</span>`;
}

function provenanceBadge(label = 'SIMULATED') {
  if (label === 'PHYSICS_SIMULATED') label = 'SIMULATED';
  const tone = String(label).toUpperCase().includes('UNKNOWN') || String(label).toUpperCase().includes('MIXED') || String(label).toUpperCase().includes('USER-SUPPLIED') ? 'badge-outline' : 'badge-sim';
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`;
}

function shipmentProvenanceLabel(shipment) {
  const source = String(shipment?.source || '').toUpperCase();
  const groundTruth = String(shipment?.groundTruthType || shipment?.qualityState?.groundTruthType || '').toUpperCase();
  if (source === 'SIMULATED' || groundTruth === 'PHYSICS_SIMULATED' || groundTruth === 'SYNTHETIC_EVENT') return 'SIMULATED';
  if (source === 'USER_SUPPLIED') return groundTruth && groundTruth !== 'UNKNOWN' ? `USER-SUPPLIED · ${groundTruth}` : 'USER-SUPPLIED · GROUND TRUTH UNKNOWN';
  if (groundTruth === 'UNKNOWN') return 'GROUND TRUTH UNKNOWN';
  return groundTruth || 'SOURCE UNKNOWN';
}

function isSimulatedShipment(shipment) {
  return shipmentProvenanceLabel(shipment) === 'SIMULATED';
}

function fleetProvenanceLabel(shipments = state.shipments) {
  const labels = new Set(shipments.map(shipmentProvenanceLabel));
  return labels.size > 1 ? 'MIXED SOURCES' : labels.values().next().value || 'NO SHIPMENTS';
}

function fleetProvenanceSummary(shipments = state.shipments) {
  const counts = { simulated: 0, unknown: 0, other: 0 };
  for (const shipment of shipments) {
    const label = shipmentProvenanceLabel(shipment);
    if (label === 'SIMULATED') counts.simulated += 1;
    else if (label.includes('UNKNOWN')) counts.unknown += 1;
    else counts.other += 1;
  }
  return [
    counts.simulated ? `${counts.simulated} simulated` : '',
    counts.unknown ? `${counts.unknown} ground truth unknown` : '',
    counts.other ? `${counts.other} other provenance` : ''
  ].filter(Boolean).join(' · ') || 'No shipment records';
}

function updateHeaderContext(view = state.view) {
  const labelNode = document.querySelector('#viewContext');
  const detailNode = document.querySelector('#viewContextDetail');
  const scopeNode = document.querySelector('#breadcrumbScope');
  if (!labelNode || !detailNode) return;
  let context;
  let scope = 'GCC network';
  if (view === 'field-data') {
    context = ['OBSERVED MULTI-SOURCE DATA', 'SAMPLES · LIMITS SHOWN PER DATASET'];
    scope = 'Public data';
  } else if (view === 'evaluation') {
    context = ['MIXED EVIDENCE', 'SYNTHETIC + PUBLIC WEAK-LABEL DATA'];
    scope = 'Evaluation';
  } else if (view === 'simulation') {
    context = ['SIMULATED QATAR / GCC', 'DOHA · UTC+3'];
  } else if (view === 'shipment' && state.selectedShipment) {
    const provenance = shipmentProvenanceLabel(state.selectedShipment);
    context = provenance === 'SIMULATED'
      ? ['SIMULATED QATAR / GCC', 'DOHA · UTC+3']
      : [provenance, 'IMPORTED SENSOR HISTORY · QUALITY LABEL NOT VERIFIED'];
    if (provenance !== 'SIMULATED') scope = 'Shipment data';
  } else if (view === 'overview' || view === 'shipments') {
    const hasSimulated = state.shipments.some(isSimulatedShipment);
    const hasOther = state.shipments.some((shipment) => !isSimulatedShipment(shipment));
    if (hasSimulated && hasOther) context = ['MIXED SHIPMENT DATA', fleetProvenanceSummary().toUpperCase()];
    else if (hasSimulated) context = ['SIMULATED QATAR / GCC', 'DOHA · UTC+3'];
    else if (hasOther) context = ['UNKNOWN GROUND TRUTH', 'UPLOADED HISTORY · NOT INDEPENDENTLY VERIFIED'];
    else context = ['SIMULATED QATAR / GCC', 'DOHA · UTC+3'];
  } else if (view === 'products') {
    context = ['DEMO MODEL CONFIGURATION', 'PARAMETERS MARKED DEMO_INPUT'];
    scope = 'Model registry';
  } else if (view === 'evidence') {
    context = ['LOCAL DEMO EVIDENCE', 'AUTHORITY IS DOCUMENT-SPECIFIC'];
    scope = 'Knowledge base';
  } else {
    context = ['SIMULATED QATAR / GCC', 'DOHA · UTC+3'];
  }
  labelNode.textContent = context[0];
  detailNode.textContent = context[1];
  if (scopeNode) scopeNode.textContent = scope;
}

function setCurrentView(view, title) {
  state.view = view;
  updateHeaderContext(view);
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view || (view === 'shipment' && item.dataset.view === 'shipments')));
  document.querySelector('#breadcrumbCurrent').textContent = title || ({ overview: 'Overview', shipments: 'Shipments', 'field-data': 'Field data', simulation: 'Simulation Lab', evaluation: 'Evaluation Lab', products: 'Product Models', evidence: 'Evidence', shipment: 'Shipment detail' }[view] ?? 'Overview');
  document.querySelector('#sidebar').classList.remove('is-open');
  document.querySelector('#mobileScrim').classList.remove('is-visible');
  render();
}

async function loadData() {
  state.loading = true;
  try {
    const [fleetData, productsData, evidenceData, evaluation, publicBenchmark, publicShipments, firstPublicShipment, fieldDataSamples] = await Promise.all([
      api('/api/shipments'), api('/api/products'), api('/api/evidence'), api('/api/evaluation/summary'),
      api('/api/public-benchmark/summary'), api('/api/public-benchmark/shipments'), api('/api/public-benchmark/shipments/S1'),
      api('/api/field-data/samples').catch(() => ({ datasets: [] }))
    ]);
    state.shipments = fleetData.shipments;
    state.fleet = fleetData.fleet;
    state.products = productsData.products;
    state.evidence = evidenceData.evidence;
    state.evaluation = evaluation;
    state.publicBenchmark = publicBenchmark;
    state.publicShipments = publicShipments.shipments || [];
    state.publicShipmentDetail = firstPublicShipment;
    state.selectedPublicShipment = firstPublicShipment.shipmentId;
    state.fieldDataSamples = fieldDataSamples;
    if (!state.selectedEvidence && state.evidence.length) state.selectedEvidence = state.evidence[0].id;
    document.querySelector('#navShipmentCount').textContent = state.shipments.length;
    updateHeaderContext();
  } catch (error) {
    root.innerHTML = `<section class="card empty-state"><div><h2>Local service unavailable</h2><p>${escapeHtml(error.message)}</p><button class="button button-primary" id="retryLoad">Try again</button></div></section>`;
    state.loading = false;
    return;
  }
  state.loading = false;
  render();
}

function render() {
  if (state.loading) return;
  if (!state.fleet) return;
  activeMap?.destroy();
  activeMap = null;
  const view = state.view;
  if (view === 'overview') {
    root.innerHTML = renderOverview();
    const mapableShipments = state.shipments.filter((shipment) => shipment.source === 'SIMULATED' || shipment.mapCoordinate);
    const visibleIds = new Set(mapableShipments.map((shipment) => shipment.id));
    if (!state.selectedMapShipmentId || !visibleIds.has(state.selectedMapShipmentId)) {
      const urgency = { CRITICAL: 4, 'AT RISK': 3, WATCH: 2, HEALTHY: 1 };
      state.selectedMapShipmentId = [...mapableShipments].sort((a, b) => (urgency[b.status] || 0) - (urgency[a.status] || 0))[0]?.id ?? null;
    }
    activeMap = mountFleetMap(document.querySelector('#overviewMap'), {
      shipments: state.shipments,
      selectedId: state.selectedMapShipmentId,
      onSelectionChange: (id) => {
        state.selectedMapShipmentId = id;
        document.querySelectorAll('[data-shipment-row]').forEach((row) => row.classList.toggle('is-map-selected', row.dataset.shipmentRow === id));
      }
    });
  }
  else if (view === 'shipments') root.innerHTML = renderShipments();
  else if (view === 'field-data') root.innerHTML = renderFieldData();
  else if (view === 'shipment') root.innerHTML = state.selectedShipment ? renderShipmentDetail(state.selectedShipment) : renderShipments();
  else if (view === 'simulation') {
    root.innerHTML = renderSimulationLab();
    if (state.simulationResult) {
      activeMap = mountSimulationMap(document.querySelector('#simulationRouteMap'), state.simulationResult, {
        toggleButton: document.querySelector('#toggleRouteAnimation'),
        progressNode: document.querySelector('#routeAnimationProgress'),
        stateNode: document.querySelector('#routeAnimationState')
      });
    }
  }
  else if (view === 'evaluation') root.innerHTML = renderEvaluationLab() + renderPublicEvaluation();
  else if (view === 'products') root.innerHTML = renderProductModels();
  else if (view === 'evidence') root.innerHTML = renderEvidence();
  else root.innerHTML = renderOverview();
}

function stageSummary() {
  const rows = [
    { id: 'PORT_HANDOFF', label: 'Port / receiving handoff' },
    { id: 'CUSTOMS_OR_STAGING', label: 'Customs & staging' },
    { id: 'REEFER_TRUCK', label: 'Reefer transit' },
    { id: 'COLD_STORAGE', label: 'Cold storage' }
  ];
  return rows.map((stage, index) => {
    const matched = state.shipments.filter((shipment) => shipment.currentStage === stage.id);
    return `<div class="stage-row"><span class="stage-marker ${index === 0 ? 'is-active' : index < 2 ? 'is-done' : ''}"></span><span class="stage-name">${stage.label}</span><span class="stage-count">${matched.length} shipment${matched.length === 1 ? '' : 's'}</span><span class="stage-debt">current</span></div>`;
  }).join('');
}

function shipmentRows(shipments = state.shipments, { focusMap = false } = {}) {
  return shipments.map((shipment) => {
    const trust = shipment.sensorTrust?.score ?? 0;
    const debt = shipment.qualityState?.qualityDebtHours ?? 0;
    const life = shipment.qualityState?.rsl_p50_hours ?? 0;
    const lowMargin = lowSideArrivalMargin(shipment.qualityState);
    const action = String(shipment.recommendation || 'INSPECT').replaceAll('_', ' ').toLowerCase();
    const provenance = shipmentProvenanceLabel(shipment);
    const canFocusMap = shipment.source === 'SIMULATED' || Boolean(shipment.mapCoordinate);
    return `<tr data-shipment-row="${escapeHtml(shipment.id)}" class="${focusMap && state.selectedMapShipmentId === shipment.id ? 'is-map-selected' : ''}">
      <td><div class="table-id"><div class="table-id-controls"><button type="button" data-open-shipment="${escapeHtml(shipment.id)}">${escapeHtml(shipment.id)}</button>${focusMap ? `<button type="button" class="table-map-focus" data-map-focus="${escapeHtml(shipment.id)}" ${canFocusMap ? '' : 'disabled title="No route position was supplied for this shipment."'}>Map</button>` : ''}</div><small>${escapeHtml(shipment.productName)} · ${escapeHtml(provenance)}</small></div></td>
      <td>${escapeHtml(String(shipment.currentStage).replaceAll('_', ' ').toLowerCase())}</td>
      <td><div class="rsl-cell">${formatHours(life)}<small>h</small></div></td>
      <td><span class="arrival-margin ${marginTone(lowMargin)}">${lowMargin === null ? '—' : `${formatHours(lowMargin, 1)} h`}</span><small class="table-subvalue">p10 − ETA · illustrative</small></td>
      <td><div class="table-debt"><span>+${formatHours(debt, 1)} h</span><span class="debt-bar"><i style="width:${Math.min(100, debt / 42 * 100)}%"></i></span></div></td>
      <td><span class="trust-inline"><i class="trust-dot ${trust < 45 ? 'is-bad' : trust < 75 ? 'is-low' : ''}"></i>${trust}%</span></td>
      <td>${statusBadge(shipment.status)}</td>
      <td class="table-action">${escapeHtml(action)}</td>
    </tr>`;
  }).join('');
}

function medianValue(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function modeledStageHeat(shipment, product) {
  const stages = (shipment.route || []).map((stage) => ({ ...stage, excessAgeHours: 0 }));
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const samples = shipment.samples || [];
  const rate = (temperatureC) => {
    const tempK = temperatureC + 273.15;
    const referenceK = product.referenceTemperatureC + 273.15;
    const exponent = -product.activationEnergyJMol / 8.314462618 * (1 / tempK - 1 / referenceK);
    return Math.min(25, Math.max(0.02, Math.exp(exponent)));
  };
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const duration = Math.max(0, Number(current.elapsedHours) - Number(previous.elapsedHours));
    const t0 = medianValue(Object.values(previous.temperaturesC || {}));
    const t1 = medianValue(Object.values(current.temperaturesC || {}));
    const stage = byId.get(current.stage || previous.stage);
    if (!stage || t0 === null || t1 === null || !duration) continue;
    const averageRate = (rate(t0) + rate(t1)) / 2;
    stage.excessAgeHours += Math.max(0, averageRate - 1) * duration;
  }
  return stages;
}

function stageImpactCard(shipment, product) {
  const stages = modeledStageHeat(shipment, product);
  const total = stages.reduce((sum, stage) => sum + stage.excessAgeHours, 0);
  const max = Math.max(total, ...stages.map((stage) => stage.excessAgeHours), 0.01);
  const scenario = shipment.scenario || {};
  const onset = Number(scenario.eventOnsetHours);
  const samples = shipment.samples || [];
  const observedThrough = Number(samples.at(-1)?.elapsedHours ?? 0);
  const eventWithinTrace = Number.isFinite(onset) && onset <= observedThrough;
  const atOnset = eventWithinTrace ? samplesClosestTo(samples, onset) : null;
  const eventStage = shipment.route?.find((stage) => stage.id === atOnset?.stage)?.label || 'route stage not supplied';
  const eventName = scenario.eventType === 'none' ? 'No event injected' : EVENT_LABELS[String(scenario.eventType || '').toUpperCase()] || String(scenario.eventType).replaceAll('_', ' ');
  const rows = stages.map((stage) => {
    const amount = stage.excessAgeHours;
    const width = total > 0 ? amount / max * 100 : 0;
    const active = scenario.eventType !== 'none' && eventWithinTrace && stage.id === atOnset?.stage;
    return `<div class="stage-impact-row ${active ? 'is-event-stage' : ''}"><div class="stage-impact-label"><strong>${escapeHtml(stage.label)}</strong>${active ? '<span>event location</span>' : ''}</div><div class="stage-impact-track"><i style="width:${width.toFixed(1)}%"></i></div><b>${formatHours(amount, 2)} h</b></div>`;
  }).join('');
  const injection = scenario.eventType === 'none'
    ? 'No fault is injected; any warming shown comes from the synthetic route trace and model inputs.'
    : !eventWithinTrace
      ? `${escapeHtml(eventName)} is scheduled for trip hour ${formatHours(onset, 2)}, after the displayed trace ends at ${formatHours(observedThrough, 2)} h. It has not affected these results yet.`
      : `${escapeHtml(eventName)} is injected at ${escapeHtml(eventStage)} around trip hour ${formatHours(onset, 2)} for ${formatHours(scenario.eventDurationHours, 2)} h.`;
  return `<article class="card stage-impact-card"><div class="card-header"><div><h2 class="card-title">Where simulated warmth adds product aging</h2><div class="card-subtitle">Desert handoff view · one synthetic route</div></div><span class="badge badge-sim">SIMULATION</span></div><div class="card-body"><p class="stage-impact-intro">${injection}</p><div class="stage-impact-list">${rows}</div><div class="stage-impact-note">Bars show extra equivalent-aging hours above the configured product reference, assigned to the stage active in each model interval. This is a synthetic diagnostic, not an observed Qatar root cause. It can differ from total Quality Debt because this view counts warm-period contributions while the shipment total also includes cooler periods.</div></div></article>`;
}

function samplesClosestTo(samples, hour) {
  if (!samples.length || !Number.isFinite(hour)) return null;
  return samples.reduce((best, sample) => Math.abs(sample.elapsedHours - hour) < Math.abs(best.elapsedHours - hour) ? sample : best, samples[0]);
}

function renderOverview() {
  const title = `<div class="page-heading"><div><div class="eyebrow">Friday, 25 September · Doha operations</div><h1>Operations overview</h1><p>Track estimated product quality across the cold chain and surface handling issues while operators can still act.</p></div><div class="heading-actions">${provenanceBadge(fleetProvenanceLabel())}<button class="button button-primary" data-view="simulation">⌁ &nbsp;Open Simulation Lab</button></div></div>`;
  const metrics = `<div class="metric-grid">
    <article class="card metric-card"><div class="metric-top"><span>Active shipments</span><span class="metric-icon">▤</span></div><div class="metric-value">${state.fleet.activeShipments}<span class="metric-unit">records</span></div><div class="metric-foot">${escapeHtml(fleetProvenanceSummary())}</div></article>
    <article class="card metric-card"><div class="metric-top"><span>Healthy</span><span class="metric-icon">✓</span></div><div class="metric-value">${state.fleet.healthy}<span class="metric-unit">in range</span></div><div class="metric-foot">No urgent signal under configured heuristics</div></article>
    <article class="card metric-card alert-card"><div class="metric-top"><span>Need attention</span><span class="metric-icon">⌁</span></div><div class="metric-value">${state.fleet.atRisk}<span class="metric-unit">watch / at risk</span></div><div class="metric-foot">Heuristic operating status · not a probability</div></article>
    <article class="card metric-card critical-card"><div class="metric-top"><span>Inspection / hold</span><span class="metric-icon">!</span></div><div class="metric-value">${state.fleet.inspectionRequired}<span class="metric-unit">review</span></div><div class="metric-foot">Food safety remains a human decision</div></article>
  </div>`;
  const mapCard = `<article class="card map-card"><div class="card-header"><div><h2 class="card-title">Hamad Port → simulated Doha distribution point</h2><div class="card-subtitle">Interactive corridor · drag to pan, scroll or use controls to zoom</div></div><span class="badge badge-sim">SIMULATED ROUTE</span></div><div class="map-card-content"><div id="overviewMap" class="interactive-map" role="application" aria-label="Interactive Qatar demo map showing generated shipment positions and route events"></div><div class="map-meta-row"><span class="map-basemap-status" data-map-status>Preparing map background…</span><span class="map-safety-note">Generated positions use elapsed trip time and ETA, not live GPS.</span></div><div class="map-legend" aria-label="Map legend"><span><i class="legend-status is-normal">✓</i>Normal</span><span><i class="legend-status is-watch">•</i>Watch</span><span><i class="legend-status is-risk">!</i>At risk</span><span><i class="legend-status is-critical">!!</i>High attention</span><span><i class="legend-event">⚠</i>Event</span><span><i class="legend-point is-origin">◆</i>Origin</span><span><i class="legend-point is-destination">◆</i>Simulated destination</span></div><p class="map-disclaimer">All Qatar/GCC routes shown here are simulated demo scenarios unless explicitly marked otherwise. The route line is an illustrative corridor, not road navigation or a real commercial shipment path.</p></div></article>`;
  const stageCard = `<article class="card"><div class="card-header"><div><h2 class="card-title">Shipments by current route stage</h2><div class="card-subtitle">Where each record reports it is now</div></div><button class="subtle-link" data-view="shipments">View fleet</button></div><div class="card-body"><div class="stage-list">${stageSummary()}</div><div class="stage-aside-note"><span>↗</span><span>This is a location count, not a measurement of which handoff caused quality loss. Use a what-if scenario to inspect simulated warming by stage.</span></div><button class="button button-compact" data-view="simulation">Explore Desert Handoff Risk →</button></div></article>`;
  const table = `<article class="card table-card"><div class="card-header"><div><h2 class="card-title">Shipment watchlist</h2><div class="card-subtitle">Select “Map” to focus a generated position, or open the shipment to inspect its full history.</div></div><button class="subtle-link" data-view="shipments">All shipments →</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Shipment / product</th><th>Route stage</th><th>RSL p50</th><th>p10 arrival margin</th><th>Quality debt</th><th>Sensor trust</th><th>Status</th><th>Suggested action</th></tr></thead><tbody>${shipmentRows([...state.shipments].sort((a, b) => (b.qualityState?.qualityDebtHours ?? 0) - (a.qualityState?.qualityDebtHours ?? 0)).slice(0, 5), { focusMap: true })}</tbody></table></div><div class="group-note">The p10 arrival margin is the lower model scenario for remaining quality life minus ETA. Parameters are illustrative and the range is not calibrated, so use it as a cautious planning signal, not a probability or safety decision.</div></article>`;
  const impact = `<article class="card impact-card"><div class="card-header"><div><h2 class="card-title">Potential sustainability contribution</h2><div class="card-subtitle">Purpose and intended alignment · outcomes not measured</div></div><span class="badge badge-outline">NO SAVINGS CLAIM</span></div><div class="card-body"><div class="impact-grid"><div><strong>SDG 12 · Target 12.3</strong><p>Direct fit: reduce avoidable food loss along supply chains. Loss reduction has not been measured by this prototype.</p></div><div><strong>SDG 2 · Zero Hunger</strong><p>Possible co-benefit: preserving food may support availability. No food-delivery or access outcomes are measured.</p></div><div><strong>SDG 13 · Climate Action</strong><p>Possible co-benefit if less food is lost. No emissions or lifecycle assessment is available.</p></div></div><div class="impact-links"><a href="https://sdgs.un.org/goals/goal12" target="_blank" rel="noreferrer">UN Goal 12 ↗</a><a href="https://sdgs.un.org/goals/goal2" target="_blank" rel="noreferrer">UN Goal 2 ↗</a><a href="https://sdgs.un.org/goals/goal13" target="_blank" rel="noreferrer">UN Goal 13 ↗</a></div></div></article>`;
  return `${title}${metrics}<div class="overview-grid">${mapCard}${stageCard}</div>${table}${impact}`;
}

function renderShipments() {
  return `<div class="page-heading"><div><div class="eyebrow">Fleet registry · ${state.shipments.length} records · ${escapeHtml(fleetProvenanceSummary())}</div><h1>Shipments</h1><p>Open a shipment to inspect its quality passport, multi-sensor history, anomaly evidence, and constrained action options.</p></div><div class="heading-actions">${provenanceBadge(fleetProvenanceLabel())}<button class="button" id="importTelemetry">↑ &nbsp;Import telemetry JSON</button><input type="file" id="telemetryFile" accept=".json,application/json" hidden><button class="button button-primary" data-view="simulation">Create scenario</button></div></div>
  <article class="card table-card"><div class="card-header"><div><h2 class="card-title">All shipment records</h2><div class="card-subtitle">Provenance is shown per record. Uploaded telemetry has unknown ground-truth status unless independently established.</div></div><span class="badge badge-safety">SAFETY · NOT DETERMINED</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Shipment / product / provenance</th><th>Route stage</th><th>RSL p50</th><th>p10 arrival margin</th><th>Quality debt</th><th>Sensor trust</th><th>Status</th><th>Suggested action</th></tr></thead><tbody>${shipmentRows()}</tbody></table></div></article>
  <div class="group-note">The p10 arrival margin is a lower model scenario for remaining quality life minus ETA. The illustrative range is not calibrated. A displayed RSL is a configured quality-age estimate; it does not approve sale, donation, redistribution, or consumption.</div>`;
}

function formatSourceTimestamp(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—';
}

function publicTemperatureChart(detail) {
  const sourceRows = detail?.rows || [];
  if (!sourceRows.length) return '<div class="empty-state">Choose a public shipment to inspect its sensor history.</div>';
  const stride = Math.max(1, Math.ceil(sourceRows.length / 220));
  const rows = sourceRows.filter((_, index) => index % stride === 0);
  if (rows.at(-1) !== sourceRows.at(-1)) rows.push(sourceRows.at(-1));
  const values = rows.flatMap((row) => row.temperaturesC.filter(Number.isFinite));
  const min = Math.floor(Math.min(...values, 0));
  const max = Math.ceil(Math.max(...values, 10));
  const width = 650, height = 256, left = 46, right = 13, top = 12, bottom = 29;
  const innerW = width - left - right, innerH = height - top - bottom;
  const x = (index) => left + (rows.length < 2 ? 0 : index / (rows.length - 1)) * innerW;
  const y = (temperature) => chartValueY(temperature, min, Math.max(max, min + 1), top, innerH);
  const sensorNames = ['Front · top', 'Front · middle', 'Front · bottom', 'Middle · top', 'Middle · middle', 'Middle · bottom', 'Rear · top', 'Rear · middle', 'Rear · bottom'];
  let markup = '';
  for (let tick = 0; tick <= 4; tick += 1) {
    const temperature = min + (max - min) * tick / 4;
    const yy = y(temperature);
    markup += `<line class="chart-gridline" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text x="${left - 7}" y="${yy + 3}" text-anchor="end">${temperature.toFixed(0)}°</text>`;
  }
  const thresholdY = y(4);
  markup += `<line x1="${left}" y1="${thresholdY}" x2="${width - right}" y2="${thresholdY}" stroke="#d48a4d" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${width - right - 3}" y="${thresholdY - 5}" text-anchor="end" fill="#b87742">4°C baseline</text>`;
  for (let sensor = 0; sensor < 9; sensor += 1) {
    const points = rows.map((row, index) => Number.isFinite(row.temperaturesC[sensor]) ? { x: x(index), y: y(row.temperaturesC[sensor]) } : null);
    markup += svgPolyline(points, `public-series-${sensor}`);
  }
  for (let tick = 0; tick <= 4; tick += 1) {
    const index = Math.round((rows.length - 1) * tick / 4);
    markup += `<text x="${x(index)}" y="${height - 7}" text-anchor="middle">${escapeHtml(formatSourceTimestamp(rows[index]?.timestamp).slice(5, 16))}</text>`;
  }
  const legend = sensorNames.map((name, index) => `<span class="legend-item"><i class="legend-swatch public-legend-${index}"></i>${name}</span>`).join('');
  return `<div class="chart-wrap"><svg class="chart-svg public-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed strawberry shipment temperatures across nine sensor positions"><title>Public strawberry shipment temperature history</title>${markup}</svg></div><div class="public-legend">${legend}</div>`;
}

function renderFieldData() {
  const summary = state.publicBenchmark || {};
  const shipmentRows = state.publicShipments || [];
  const detail = state.publicShipmentDetail;
  const eligible = summary.eligibleRowCount || 0;
  const positive = summary.positiveTargetCount || 0;
  const coverage = eligible ? Math.round(positive / eligible * 100) : 0;
  const metrics = `<div class="metric-grid public-metrics">
    <article class="card metric-card"><div class="metric-top"><span>Observed shipments</span><span class="metric-icon">▤</span></div><div class="metric-value">${summary.shipmentCount ?? '—'}<span class="metric-unit">shipments</span></div><div class="metric-foot">US strawberry study · not Qatar routes</div></article>
    <article class="card metric-card"><div class="metric-top"><span>Temperature windows</span><span class="metric-icon">◷</span></div><div class="metric-value">${new Intl.NumberFormat('en').format(summary.rowCount || 0)}<span class="metric-unit">10 min windows</span></div><div class="metric-foot">Nine pallet-position probes per window</div></article>
    <article class="card metric-card"><div class="metric-top"><span>Usable target rows</span><span class="metric-icon">✓</span></div><div class="metric-value">${new Intl.NumberFormat('en').format(eligible)}<span class="metric-unit">rows</span></div><div class="metric-foot">Trainable rows with a binary future label</div></article>
    <article class="card metric-card alert-card"><div class="metric-top"><span>Rule-label positives</span><span class="metric-icon">⌁</span></div><div class="metric-value">${coverage}%<span class="metric-unit">of usable rows</span></div><div class="metric-foot">Future R2 temperature state · weak label</div></article>
  </div>`;
  const shipmentList = shipmentRows.map((shipment) => `<button type="button" class="public-shipment-button ${shipment.shipmentId === state.selectedPublicShipment ? 'is-selected' : ''}" data-public-shipment="${escapeHtml(shipment.shipmentId)}"><span><strong>${escapeHtml(shipment.shipmentId)}</strong><small>${escapeHtml(formatSourceTimestamp(shipment.startTimestamp))} → ${escapeHtml(formatSourceTimestamp(shipment.endTimestamp))}</small></span><span class="public-shipment-count">${new Intl.NumberFormat('en').format(shipment.rowCount)}<small>windows</small></span></button>`).join('');
  const labelCount = detail?.rows?.filter((row) => row.targetNext120 === 1).length ?? 0;
  const labelCoverage = detail?.rows?.filter((row) => row.targetNext120 === 0 || row.targetNext120 === 1).length ?? 0;
  const labelPercent = labelCoverage ? Math.round(labelCount / labelCoverage * 100) : 0;
  const detailCard = detail ? `<article class="card public-detail-card"><div class="card-header"><div><h2 class="card-title">Shipment ${escapeHtml(detail.shipmentId)} · observed temperatures</h2><div class="card-subtitle">Nine logger positions inside three instrumented pallets · dataset timestamps shown as provided</div></div><span class="badge badge-high">OBSERVED TELEMETRY</span></div><div class="card-body"><div class="public-shipment-stats"><div><span>Time windows</span><strong>${new Intl.NumberFormat('en').format(detail.rowCount)}</strong></div><div><span>Rule-derived next-2h positives</span><strong>${labelPercent}%</strong></div><div><span>Time range</span><strong>${escapeHtml(formatSourceTimestamp(detail.rows[0]?.timestamp))} — ${escapeHtml(formatSourceTimestamp(detail.rows.at(-1)?.timestamp))}</strong></div></div>${publicTemperatureChart(detail)}<div class="public-chart-caption">Observed probe temperatures. The dashed 4°C line is used only by the comparison rule in this demo; it is not a safety limit or universal product specification.</div></div></article>` : '<article class="card empty-state">Shipment detail is loading.</article>';
  return `<div class="page-heading"><div><div class="eyebrow">Public field evidence · dataset release</div><h1>Real shipment temperatures</h1><p>Explore temperature variation inside real strawberry shipments. This gives the project real logistics telemetry while keeping the synthetic Qatar demonstration separate.</p></div><div class="heading-actions"><span class="badge badge-high">OBSERVED TEMPERATURES</span><span class="badge badge-watch">WEAK FUTURE LABELS</span></div></div>
    <article class="card public-boundary" id="strawberry-observed"><div class="public-boundary-icon">i</div><div><strong>What this data can tell us</strong><p>It shows how temperatures differed across cargo positions over time. The benchmark also includes author-derived labels about whether a shipment will enter a severe temperature state within 120 minutes. Those labels do not say that food spoiled, and they do not say food is safe.</p><a href="https://huggingface.co/datasets/NifferLi/Cold-Chain-Transportation-Strawberry" target="_blank" rel="noreferrer">Open dataset source and license ↗</a> <span>·</span> <a href="https://arxiv.org/abs/2103.12895" target="_blank" rel="noreferrer">Read the original sensor study ↗</a></div></article>
    ${metrics}<div class="public-data-grid"><article class="card"><div class="card-header"><div><h2 class="card-title">Choose one of six observed shipments</h2><div class="card-subtitle">All logger rows remain grouped by shipment</div></div><span class="badge badge-outline">${shipmentRows.length} GROUPS</span></div><div class="public-shipment-list">${shipmentList}</div><div class="public-list-note">The six shipments traveled in the United States. Qatar route stages and handoffs in the Operations view are simulated.</div></article>${detailCard}</div>
    <div class="group-note"><strong>Provenance:</strong> raw temperature telemetry is observed field data. The dataset’s future R2 target is a rule-derived weak label. The current RSL, spoilage, quality-debt, and safety estimates are not trained or validated by this dataset.</div>
    ${renderMeasuredDataLibrary()}`;
}

function fieldSampleChart(sample) {
  const series = sample?.series || [];
  const timed = series.flatMap((item) => item.points || []).filter((point) => Number.isFinite(Number(point.v)) && point.t);
  if (!timed.length) return '<div class="empty-state">No timestamped sample is available for this source.</div>';
  const parsedTimes = timed.map((point) => Date.parse(point.t)).filter(Number.isFinite);
  const minTime = parsedTimes.length ? Math.min(...parsedTimes) : 0;
  const maxTime = parsedTimes.length ? Math.max(...parsedTimes) : timed.length - 1;
  const minValue = Math.floor(Math.min(...timed.map((point) => Number(point.v))) - 1);
  const maxValue = Math.ceil(Math.max(...timed.map((point) => Number(point.v))) + 1);
  const width = 720, height = 248, left = 46, right = 14, top = 16, bottom = 30;
  const innerW = width - left - right, innerH = height - top - bottom;
  const x = (time, index, count) => left + (maxTime > minTime ? (time - minTime) / (maxTime - minTime) : index / Math.max(count - 1, 1)) * innerW;
  const y = (value) => chartValueY(value, minValue, maxValue, top, innerH);
  let markup = '';
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = minValue + (maxValue - minValue) * tick / 4;
    const yy = y(value);
    markup += `<line class="chart-gridline" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text x="${left - 8}" y="${yy + 3}" text-anchor="end">${value.toFixed(0)}°C</text>`;
  }
  for (const tick of [0, 0.5, 1]) {
    const xx = left + innerW * tick;
    markup += `<line class="chart-gridline" x1="${xx}" y1="${top}" x2="${xx}" y2="${height - bottom}" opacity=".45"/>`;
  }
  series.forEach((item, seriesIndex) => {
    const points = (item.points || []).map((point, index, rows) => {
      const time = Date.parse(point.t);
      return { x: x(Number.isFinite(time) ? time : index, index, rows.length), y: y(Number(point.v)) };
    });
    markup += svgPolyline(points, `field-sample-series-${seriesIndex % 4}`);
  });
  const orderedTimed = [...timed].sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const first = orderedTimed[0]?.t;
  const middle = orderedTimed[Math.floor(orderedTimed.length / 2)]?.t;
  const last = orderedTimed.at(-1)?.t;
  const labels = [first, middle, last];
  labels.forEach((value, index) => {
    markup += `<text x="${left + innerW * index / 2}" y="${height - 8}" text-anchor="${index === 0 ? 'start' : index === 2 ? 'end' : 'middle'}">${escapeHtml(formatSourceTimestamp(value))}</text>`;
  });
  const legend = series.map((item, index) => `<span class="legend-item"><i class="legend-swatch field-sample-swatch-${index % 4}"></i>${escapeHtml(item.name)} · ${new Intl.NumberFormat('en').format(item.count)} readings</span>`).join('');
  return `<div class="chart-wrap"><svg class="chart-svg field-sample-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed temperature sample from ${escapeHtml(sample.label)}"><title>${escapeHtml(sample.label)}</title>${markup}</svg></div><div class="public-legend">${legend}</div>`;
}

function renderMeasuredDataLibrary() {
  const datasets = state.fieldDataSamples?.datasets || [];
  if (!datasets.length) return '<article class="card empty-state"><div><h2>Additional measured sources are unavailable</h2><p>The strawberry shipment view remains available above. Regenerate the compact samples from the local source files to restore this library.</p></div></article>';
  const selected = datasets.find((dataset) => dataset.id === state.selectedFieldDataset) || datasets.find((dataset) => dataset.id === 'milk') || datasets[0];
  const sourceButtons = datasets.map((dataset) => `<button type="button" class="field-source-button ${dataset.id === selected.id ? 'is-selected' : ''}" data-field-dataset="${escapeHtml(dataset.id)}"><span class="field-source-button-top"><strong>${escapeHtml(dataset.title)}</strong><span>${new Intl.NumberFormat('en').format(dataset.observationCount || 0)}<small> readings</small></span></span><span class="field-source-button-note">${dataset.qualityCount ? `${new Intl.NumberFormat('en').format(dataset.qualityCount)} separate measured quality values` : 'No measured lab-quality values'}</span></button>`).join('');
  const sample = selected.sample || {};
  const graph = sample.kind === 'time-series' ? fieldSampleChart(sample) : '';
  const humidityValues = sample.kind === 'time-series'
    ? (sample.series || []).flatMap((item) => item.points || []).map((point) => point.humidity).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number)
    : [];
  const humidityNote = humidityValues.length
    ? `Humidity values present in the plotted sample: ${Math.min(...humidityValues).toFixed(1)}–${Math.max(...humidityValues).toFixed(1)}% across ${new Intl.NumberFormat('en').format(humidityValues.length)} points.`
    : '';
  const retailTable = sample.kind === 'aggregate-table' ? `<div class="table-scroll"><table class="data-table field-retail-table"><thead><tr><th>Case / position</th><th>Mean</th><th>Min–max</th><th>Above source limit</th></tr></thead><tbody>${(sample.records || []).map((row) => `<tr><td>${escapeHtml(row.case)} · ${escapeHtml(row.position)}</td><td>${escapeHtml(row.meanC)}°C</td><td>${row.minimumC == null ? '—' : `${escapeHtml(row.minimumC)}°–${escapeHtml(row.maximumC)}°C`}</td><td>${row.percentAboveSourceLimit == null ? '—' : `${escapeHtml(Number(row.percentAboveSourceLimit).toFixed(1))}%`}</td></tr>`).join('')}</tbody></table></div>` : '';
  const quality = selected.qualityCount ? `<article class="field-quality-card"><div class="field-subhead"><div><h3>Separate measured quality records</h3><p>These lab or fruit measurements are from the source dataset. They are not silently matched to the temperature trace above.</p></div><span class="badge badge-outline">${new Intl.NumberFormat('en').format(selected.qualityCount)} TOTAL</span></div><div class="field-metric-chips">${(selected.quality?.metrics || []).map((metric) => `<span>${escapeHtml(metric.name.replaceAll('_', ' '))}<b>${new Intl.NumberFormat('en').format(metric.count)}</b></span>`).join('')}</div><div class="table-scroll"><table class="data-table field-quality-table"><thead><tr><th>Source sample</th><th>Recorded time</th><th>Measurement</th><th>Value</th></tr></thead><tbody>${(selected.quality?.examples || []).map((row) => `<tr><td>${escapeHtml(row.sample)}</td><td>${escapeHtml(row.measuredAt)}</td><td>${escapeHtml(row.metric.replaceAll('_', ' '))}</td><td>${escapeHtml(row.value)} ${escapeHtml(row.unit)}</td></tr>`).join('')}</tbody></table></div></article>` : '';
  const sampleContent = sample.kind === 'existing-view'
    ? `<div class="field-existing-note"><strong>This source is already displayed above.</strong><p>The six strawberry shipment traces and their source-derived weak labels are shown in the section above. No laboratory spoilage or RSL target is provided.</p><a href="#strawberry-observed">Go to strawberry traces ↑</a></div>`
    : sample.kind === 'aggregate-table'
      ? `<div class="field-sample-topline"><strong>${escapeHtml(sample.label)}</strong><span>${escapeHtml(sample.timeBasis)}</span></div>${retailTable}<p class="field-source-row">Sample row locator: ${escapeHtml(sample.records?.[0]?.sourceRow || '—')}</p>`
      : `<div class="field-sample-topline"><strong>${escapeHtml(sample.label)} · ${escapeHtml(sample.group || '')}</strong><span>${escapeHtml(sample.timeBasis || '')}</span></div>${graph}<p class="field-sample-foot">${sample.series?.reduce((sum, item) => sum + item.count, 0).toLocaleString('en')} source readings represented · plotted points are bounded for display. ${humidityNote ? `${escapeHtml(humidityNote)} ` : ''}Example source rows: ${escapeHtml((sample.sourceRows || []).slice(0, 2).join(' · '))}</p>`;
  return `<section class="field-library-section"><div class="page-heading field-library-heading"><div><div class="eyebrow">Measured evidence library · five sources</div><h2>Explore more than the strawberry route</h2><p>These are real published observations from different parts of the food chain. Pick a source to see what was recorded and what it can actually support.</p></div><a class="button" href="/field-data-samples.json" download>Download compact sample</a></div>
    <div class="field-library-grid"><div class="card field-source-list"><div class="card-header"><div><h3 class="card-title">Choose a dataset</h3><div class="card-subtitle">Counts refer to validated source records; one record is one measurement</div></div><span class="badge badge-outline">${datasets.length} SOURCES</span></div><div class="field-source-buttons">${sourceButtons}</div></div>
    <article class="card field-dataset-detail"><div class="card-header"><div><h3 class="card-title">${escapeHtml(selected.title)}</h3><div class="card-subtitle">${escapeHtml(selected.region)} · ${new Intl.NumberFormat('en').format(selected.observationCount || 0)} observed sensor or aggregate records</div></div><span class="badge badge-high">SOURCE DATA</span></div><div class="card-body"><p class="field-dataset-what">${escapeHtml(selected.what)}</p><div class="field-dataset-citation"><a href="${escapeHtml(selected.url)}" target="_blank" rel="noreferrer">${escapeHtml(selected.citation)} ↗</a><span>${escapeHtml(selected.license)}</span></div>${sampleContent}<div class="field-limit-note"><strong>Scope and limitation</strong><p>${escapeHtml(selected.limit)}</p><strong>Useful for</strong><p>${escapeHtml(selected.use)}</p></div></div></article></div>
    ${quality}<div class="group-note"><strong>How to read this page:</strong> measured public data help us inspect sensor patterns and data quality. These records are kept separate from the simulated Qatar shipment screens. None of these sample traces trains the dashboard’s RSL estimate or gives a food-safety decision.</div></section>`;
}

function chartValueY(value, min, max, top, height) {
  const ratio = (value - min) / Math.max(max - min, 0.001);
  return top + height - ratio * height;
}

function svgPolyline(points, className) {
  const segments = [];
  let current = [];
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(point);
  }
  if (current.length) segments.push(current);
  return segments.map((segment) => `<polyline class="${className}" points="${segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}"/>`).join('');
}

function temperatureChart(shipment, product) {
  const samples = shipment.samples || [];
  if (!samples.length) return '<div class="empty-state">No temperature history is available.</div>';
  const width = 760, height = 250, left = 44, right = 14, top = 16, bottom = 28;
  const innerW = width - left - right, innerH = height - top - bottom;
  const values = samples.flatMap((sample) => Object.values(sample.temperaturesC || {}).filter(Number.isFinite));
  const minValue = Math.floor(Math.min(product.referenceTemperatureC - 1, ...values) - 1);
  const maxValue = Math.ceil(Math.max(product.referenceTemperatureC + 4, ...values) + 1);
  const maxTime = Math.max(samples.at(-1).elapsedHours, 1);
  const x = (time) => left + (time / maxTime) * innerW;
  const y = (value) => chartValueY(value, minValue, maxValue, top, innerH);
  let markup = '';
  for (let tick = 0; tick <= 4; tick += 1) {
    const v = minValue + (maxValue - minValue) * tick / 4;
    const yy = y(v);
    markup += `<line class="chart-gridline" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text x="${left - 8}" y="${yy + 3}" text-anchor="end">${v.toFixed(0)}°</text>`;
  }
  for (let tick = 0; tick <= 4; tick += 1) {
    const t = maxTime * tick / 4;
    const xx = x(t);
    markup += `<line class="chart-gridline" x1="${xx}" y1="${top}" x2="${xx}" y2="${height - bottom}" opacity=".4"/><text x="${xx}" y="${height - 8}" text-anchor="middle">${t.toFixed(0)}h</text>`;
  }
  const temperatureEvents = (shipment.events || []).filter((event) => !['SENSOR_DRIFT', 'SENSOR_STUCK', 'SENSOR_DROPOUT', 'GPS_DROPOUT', 'PEER_DISAGREEMENT'].includes(event.type));
  for (const event of temperatureEvents) {
    const ex = x(event.startHour || 0), end = x(event.endHour || event.startHour || 0);
    const label = EVENT_LABELS[event.type] || event.type.replaceAll('_', ' ').toLowerCase();
    const title = `${label} · ${formatClock(event.startHour)}–${formatClock(event.endHour)} trip time · heuristic event`;
    markup += `<rect class="chart-event" x="${ex}" y="${top}" width="${Math.max(3, end - ex)}" height="${innerH}" tabindex="0" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title></rect>`;
  }
  const refY = y(product.referenceTemperatureC);
  markup += `<line class="chart-ref-line" x1="${left}" y1="${refY}" x2="${width - right}" y2="${refY}"/>`;
  const eventThresholdC = product.referenceTemperatureC + 2.5;
  const thresholdY = y(eventThresholdC);
  markup += `<line class="chart-threshold-line" x1="${left}" y1="${thresholdY}" x2="${width - right}" y2="${thresholdY}"/><text class="chart-threshold-label" x="${width - right - 3}" y="${Math.max(top + 8, thresholdY - 5)}" text-anchor="end">event rule · ${eventThresholdC.toFixed(1)}°C</text>`;
  const colors = { front: 'chart-temp-front', centre: 'chart-temp-centre', rear: 'chart-temp-rear', door: 'chart-temp-door' };
  for (const sensor of SENSOR_ORDER) {
    const points = samples.map((sample) => Number.isFinite(sample.temperaturesC?.[sensor]) ? { x: x(sample.elapsedHours), y: y(sample.temperaturesC[sensor]) } : null);
    markup += svgPolyline(points, colors[sensor]);
    const stride = Math.max(1, Math.ceil(samples.length / 80));
    samples.forEach((sample, index) => {
      const temperature = sample.temperaturesC?.[sensor];
      if (!Number.isFinite(temperature) || (index % stride !== 0 && index !== samples.length - 1)) return;
      const matchingEvent = temperatureEvents.find((event) => sample.elapsedHours >= event.startHour && sample.elapsedHours <= event.endHour);
      const sensorName = SENSOR_LABELS[sensor];
      const eventName = matchingEvent ? (EVENT_LABELS[matchingEvent.type] || 'Temperature excursion') : 'No detected temperature event';
      const tooltip = `${formatClock(sample.elapsedHours)} trip time · ${sensorName} · ${temperature.toFixed(2)}°C · ${eventName}`;
      markup += `<circle class="chart-point ${colors[sensor]}" cx="${x(sample.elapsedHours).toFixed(1)}" cy="${y(temperature).toFixed(1)}" r="5" tabindex="0" role="img" aria-label="${escapeHtml(tooltip)}"><title>${escapeHtml(tooltip)}</title></circle>`;
    });
  }
  return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Temperature history for four pallet sensors"><title>Multi-sensor temperature history</title>${markup}</svg></div>`;
}

function deriveRslSeries(shipment, product) {
  const samples = shipment.samples || [];
  let eqAge = 0;
  const rows = [];
  let previous = null;
  for (const sample of samples) {
    const values = Object.values(sample.temperaturesC || {}).filter(Number.isFinite).sort((a, b) => a - b);
    const temperature = values.length ? values[Math.floor(values.length / 2)] : product.referenceTemperatureC;
    if (previous) {
      const dt = sample.elapsedHours - previous.hour;
      const t0 = previous.temp + 273.15, t1 = temperature + 273.15, tr = product.referenceTemperatureC + 273.15;
      const rate = (tempK) => Math.exp(-product.activationEnergyJMol / 8.314462618 * (1 / tempK - 1 / tr));
      eqAge += Math.max(0, dt) * (rate(t0) + rate(t1)) / 2;
    }
    rows.push({ hour: sample.elapsedHours, rsl: Math.max(0, product.nominalShelfLifeHours - eqAge) });
    previous = { hour: sample.elapsedHours, temp: temperature };
  }
  return rows;
}

function rslChart(shipment, product) {
  const rows = deriveRslSeries(shipment, product);
  if (!rows.length) return '<div class="empty-state">No RSL history is available.</div>';
  const width = 560, height = 206, left = 42, right = 12, top = 12, bottom = 26;
  const innerW = width - left - right, innerH = height - top - bottom;
  const maxX = Math.max(rows.at(-1).hour, 1);
  const maxY = Math.ceil(product.nominalShelfLifeHours / 24) * 24;
  const x = (value) => left + value / maxX * innerW;
  const y = (value) => chartValueY(value, 0, maxY, top, innerH);
  let markup = '';
  for (let tick = 0; tick <= 3; tick += 1) {
    const v = maxY * tick / 3, yy = y(v);
    markup += `<line class="chart-gridline" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text x="${left - 7}" y="${yy + 3}" text-anchor="end">${Math.round(v)}h</text>`;
  }
  markup += svgPolyline(rows.map((item) => ({ x: x(item.hour), y: y(item.rsl) })), 'chart-line-main');
  for (let tick = 0; tick <= 4; tick += 1) {
    const xx = left + innerW * tick / 4;
    markup += `<text x="${xx}" y="${height - 7}" text-anchor="middle">${(maxX * tick / 4).toFixed(0)}h</text>`;
  }
  return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Illustrative remaining shelf-life estimate through the observed trip"><title>Physics estimated remaining shelf life</title>${markup}</svg></div>`;
}

function qualityStack(shipment) {
  const q = shipment.qualityState;
  const lowMargin = lowSideArrivalMargin(q);
  const quality = `<div class="quality-hero"><div class="quality-hero-label">Remaining quality life · p50</div><div class="quality-hero-value">${formatHours(q.rsl_p50_hours)}<small> h</small></div><div class="quality-range">Illustrative 10–90% parameter range: ${formatHours(q.rsl_p10_hours)}–${formatHours(q.rsl_p90_hours)} h</div></div>`;
  return `${quality}<div class="quality-row"><span>Quality debt</span><strong>+${formatHours(q.qualityDebtHours, 1)} h</strong></div><div class="quality-row"><span>Equivalent quality age</span><strong>${formatHours(q.equivalentAgeHours, 1)} h</strong></div><div class="quality-row"><span>Arrival margin · p50 heuristic</span><strong>${formatHours(q.arrivalMarginHours, 1)} h <span class="badge badge-${q.riskBand === 'HIGH' ? 'critical' : q.riskBand === 'ELEVATED' ? 'risk' : q.riskBand === 'WATCH' ? 'watch' : 'healthy'}">${escapeHtml(q.riskBand)}</span></strong></div><div class="quality-row"><span>Lower-scenario arrival margin · p10</span><strong class="arrival-margin ${marginTone(lowMargin)}">${lowMargin === null ? '—' : `${formatHours(lowMargin, 1)} h`}</strong></div><div class="small-muted">Margin = estimated remaining quality life minus ETA. P10 is the lower end of illustrative model samples; its real-world coverage has not been calibrated.</div><div class="quality-row"><span>Sensor confidence</span><strong>${shipment.sensorTrust.score}% · ${escapeHtml(shipment.sensorTrust.label)}</strong></div><div class="quality-row"><span>Input provenance</span><strong>${escapeHtml(shipmentProvenanceLabel(shipment))}</strong></div><div class="safety-box"><strong>Safety · NOT AUTOMATICALLY DETERMINED</strong><p>This quality model does not certify food as safe for sale or consumption. Follow approved product rules and require an authorised human decision.</p></div>`;
}

function renderEventList(events = []) {
  if (!events.length) return '<div class="empty-state">No actionable temperature or sensor events detected in this history.</div>';
  return `<div class="event-list">${events.map((event) => {
    const marker = event.severity === 'CRITICAL' || event.severity === 'HIGH' ? 'is-red' : ['SENSOR_STUCK', 'SENSOR_DRIFT', 'SENSOR_DROPOUT'].includes(event.type) ? 'is-blue' : '';
    const time = `${formatClock(event.startHour)}–${formatClock(event.endHour)}`;
    return `<article class="event-item"><span class="event-marker ${marker}"></span><div class="event-copy"><div class="event-title"><span>${escapeHtml(EVENT_LABELS[event.type] || event.type.replaceAll('_', ' ').toLowerCase())}</span><span class="badge badge-${event.severity === 'CRITICAL' || event.severity === 'HIGH' ? 'critical' : 'watch'}">${escapeHtml(event.severity)}</span></div><p>${escapeHtml(event.evidence?.[0] || 'Heuristic signal detected.')} <span class="event-time">${time} trip time</span></p></div></article>`;
  }).join('')}</div>`;
}

function renderRouteProgress(shipment) {
  if (!shipment.route?.length) return '<div class="small-muted">Route stages were not supplied with this telemetry.</div>';
  return `<div class="route-progress">${shipment.route.map((stage) => `<div class="route-stop ${stage.complete ? 'is-done' : ''} ${stage.current ? 'is-current' : ''}"><span class="route-track"><i class="route-dot"></i></span><span>${escapeHtml(stage.label)}</span>${stage.current ? '<small>NOW</small>' : ''}</div>`).join('')}</div>`;
}

function sensorPanel(shipment) {
  const recent = shipment.samples.slice(-1)[0]?.temperaturesC ?? {};
  const sorted = SENSOR_ORDER.map((id) => [id, recent[id]]).filter(([, value]) => Number.isFinite(value));
  const all = sorted.map(([, value]) => value);
  const low = Math.min(...all, 0), high = Math.max(...all, 8);
  return `<div class="sensor-grid">${SENSOR_ORDER.map((id) => {
    const value = recent[id];
    const normalized = Number.isFinite(value) ? Math.min(100, Math.max(5, (value - low) / Math.max(high - low, 1) * 100)) : 0;
    const flags = shipment.sensorTrust.flags.filter((flag) => flag.sensorId === id);
    return `<div class="sensor-row ${flags.length ? 'is-alert' : ''}"><span>${SENSOR_LABELS[id]}</span><span class="sensor-track"><i style="width:${normalized}%"></i></span><strong>${Number.isFinite(value) ? `${value.toFixed(1)}°C` : 'Missing'}</strong></div>`;
  }).join('')}</div>${shipment.sensorTrust.flags.length ? `<div class="sensor-flags">${shipment.sensorTrust.flags.map((flag) => `<span class="sensor-flag">${escapeHtml(flag.sensorId ? SENSOR_LABELS[flag.sensorId] : 'Fleet')}: ${escapeHtml(EVENT_LABELS[flag.type] || flag.type.replaceAll('_', ' ').toLowerCase())}</span>`).join('')}</div>` : '<p class="small-muted">No sensor health flags in the recent sample window.</p>'}<div class="quality-row" style="margin-top:8px"><span>Cross-sensor trust method</span><strong>Peer consistency · heuristic</strong></div>`;
}

function recommendationPanel(shipment) {
  const primary = shipment.recommendation || shipment.actions?.[0] || { action: 'INSPECT', reasonCodes: [] };
  const reasons = (primary.reasonCodes || []).map((item) => item.replaceAll('_', ' ').toLowerCase());
  const ranked = (shipment.actions || []).filter((item) => item.eligibility === 'ELIGIBLE').slice(0, 4);
  const blocked = (shipment.actions || []).filter((item) => item.eligibility !== 'ELIGIBLE');
  return `<article class="card recommendation-card"><div class="recommendation-banner"><div class="section-kicker">Recommended next action · deterministic</div><div class="recommendation-action">${escapeHtml(primary.action.replaceAll('_', ' '))}</div><div class="recommendation-reason">${escapeHtml(reasons.slice(0, 2).join(' · ') || 'Quality state reviewed under demo policy.')}</div></div><div class="card-body"><div class="quality-row"><span>Priority score</span><strong>${primary.score} / 100 <span class="small-muted">heuristic</span></strong></div><div class="quality-row"><span>Estimated action cost</span><strong>${formatQar(primary.expectedCostQar)} <span class="small-muted">DEMO_INPUT</span></strong></div><div class="quality-row"><span>Loss avoided</span><strong>Unavailable <span class="small-muted">uncalibrated</span></strong></div><div class="action-list">${ranked.map((item, index) => `<div class="action-row"><span class="action-name"><b>${index + 1}.</b> ${escapeHtml(item.action.replaceAll('_', ' ').toLowerCase())}</span><span class="action-score">${item.score}<em>priority</em></span></div>`).join('')}${blocked.length ? `<div class="action-row is-blocked"><span class="action-name">${blocked.map((item) => escapeHtml(item.action.replaceAll('_', ' ').toLowerCase())).join(', ')}</span><span class="blocked-label">BLOCKED · safety clearance</span></div>` : ''}</div><div class="human-note">Food sale, donation, and redistribution are never inferred from the quality score. Human inspection may be required; the safety status is not determined.</div><button type="button" class="button button-compact" data-use-scenario="${escapeHtml(shipment.id)}" style="margin-top:10px">Open what-if comparison ↗</button></div></article>`;
}

function baselineMiniTable(qualityState) {
  const rows = (qualityState.baselines || []).map((baseline) => `<div class="baseline-mini-row"><span><strong>${escapeHtml(baseline.name)}</strong><small>${escapeHtml(baseline.note)}</small></span><b>${baseline.rslHours === null ? (baseline.triggered ? 'ALERT' : '—') : `${formatHours(baseline.rslHours, 1)} h`}</b></div>`).join('');
  return `<div class="baseline-mini">${rows}</div>`;
}

function renderShipmentDetail(shipment) {
  const product = state.products.find((item) => item.id === shipment.productId) || { referenceTemperatureC: 4, nominalShelfLifeHours: 144, activationEnergyJMol: 65000 };
  const productName = shipment.productName || product.name || shipment.productId;
  const routeText = String(shipment.currentStage || '').replaceAll('_', ' ').toLowerCase();
  const detailHeading = `<div class="page-heading"><div class="shipment-heading"><button class="back-button" data-view="shipments" aria-label="Back to shipment list">←</button><div><div class="eyebrow">Shipment quality passport</div><h1>${escapeHtml(shipment.id)}</h1></div></div><div class="heading-actions"><div class="shipment-meta">${statusBadge(shipment.status)}${provenanceBadge(shipmentProvenanceLabel(shipment))}<span class="badge badge-outline">${escapeHtml(productName)}</span></div></div></div>`;
  const stageOrigin = shipment.source === 'USER_SUPPLIED' ? 'User-supplied or inferred stage' : 'SIMULATED route stage';
  const etaOrigin = shipment.source === 'USER_SUPPLIED' ? 'User-supplied/default ETA input' : 'demo ETA input';
  const tiles = `<div class="info-tiles"><div class="info-tile"><span>Route stage</span><strong>${escapeHtml(routeText)}</strong><small>${stageOrigin}</small></div><div class="info-tile"><span>ETA</span><strong>${formatHours(shipment.etaHours, 1)} h</strong><small>${shipment.scenario?.delayHours ? `includes ${formatHours(shipment.scenario.delayHours, 1)} h demo delay` : etaOrigin}</small></div><div class="info-tile"><span>Remaining life · p50</span><strong>${formatHours(shipment.qualityState.rsl_p50_hours)} h</strong><small>Illustrative model estimate</small></div><div class="info-tile"><span>Arrival margin</span><strong>${formatHours(shipment.qualityState.arrivalMarginHours, 1)} h</strong><small>Heuristic · not a probability</small></div></div>`;
  const charts = `<div class="shipment-main-grid"><section class="card"><div class="card-header"><div><h2 class="card-title">Temperature history</h2><div class="card-subtitle">Four pallet positions · setpoint ${product.referenceTemperatureC}°C · highlighted windows are heuristic excursions</div></div>${provenanceBadge(shipmentProvenanceLabel(shipment))}</div>${temperatureChart(shipment, product)}<div class="chart-legend"><span class="legend-item"><i class="legend-swatch"></i>Front</span><span class="legend-item"><i class="legend-swatch legend-centre"></i>Centre</span><span class="legend-item"><i class="legend-swatch legend-rear"></i>Rear</span><span class="legend-item"><i class="legend-swatch legend-door"></i>Door-side</span><span class="legend-item"><i class="legend-swatch legend-ref"></i>Configured reference</span></div></section><section class="card"><div class="card-header"><div><h2 class="card-title">Quality passport</h2><div class="card-subtitle">Quality condition and safety policy stay separate</div></div><span class="badge badge-outline">MODEL ESTIMATE</span></div><div class="card-body"><div class="quality-stack">${qualityStack(shipment)}</div></div></section></div>`;
  const secondary = `<div class="shipment-bottom-grid"><section class="card"><div class="card-header"><div><h2 class="card-title">RSL history & baselines</h2><div class="card-subtitle">Arrhenius estimate · median line over time</div></div><span class="badge badge-neutral">HYBRID FALLBACK</span></div>${rslChart(shipment, product)}<div class="chart-legend"><span class="legend-item"><i class="legend-swatch"></i>Physics estimate</span></div><div class="small-muted" style="padding:0 15px 9px">Residual correction stays inactive because measured product-quality labels are unavailable.</div>${baselineMiniTable(shipment.qualityState)}</section><section class="card"><div class="card-header"><div><h2 class="card-title">Sensor trust</h2><div class="card-subtitle">Recent values · ${escapeHtml(shipment.sensorTrust.method)}</div></div><span class="badge badge-${shipment.sensorTrust.score >= 80 ? 'healthy' : shipment.sensorTrust.score >= 55 ? 'watch' : 'risk'}">${shipment.sensorTrust.score}%</span></div><div class="card-body">${sensorPanel(shipment)}</div></section><section class="card"><div class="card-header"><div><h2 class="card-title">Anomaly timeline</h2><div class="card-subtitle">Event detection stays separate from RSL prediction</div></div><span class="badge badge-outline">RULE-BASED</span></div><div class="card-body">${renderEventList(shipment.events)}</div></section></div>
  <div class="shipment-bottom-grid" style="margin-top:14px"><section class="card"><div class="card-header"><div><h2 class="card-title">Grounded operator explanation</h2><div class="card-subtitle">Local evidence · optional configured endpoint</div></div><span class="badge badge-outline">HUMAN REVIEW REQUIRED</span></div><div class="card-body"><p class="small-muted" style="margin-top:0">Ask a question about the current estimate. Without a configured endpoint, the answer stays local. If CCG_LLM_ENDPOINT is configured, the quality summary, allowed actions, retrieved evidence, and your question are sent to that endpoint for an explanation. The advisor cannot change RSL or determine food safety.</p><div class="form-split"><input class="input-control" id="advisorQuestion" type="text" maxlength="240" value="Why did you alert?" aria-label="Ask about this shipment"><button class="button button-primary" id="askAdvisor" type="button">Ask Guardian</button></div><div id="advisorResponse" style="margin-top:11px"><div class="advisor-box"><p class="advisor-answer">${shipment.events.length ? 'A temperature or sensor signal needs attention. Select “Ask Guardian” to see the local evidence and configured assumptions.' : 'No active anomaly was detected. Select “Ask Guardian” to inspect the current model state.'}</p></div></div></div></section><section class="card"><div class="card-header"><div><h2 class="card-title">Route progress</h2><div class="card-subtitle">Schematic milestones</div></div>${provenanceBadge(shipment.route?.length ? 'SIMULATED MILESTONES' : 'NOT SUPPLIED')}</div><div class="card-body">${renderRouteProgress(shipment)}</div></section>${recommendationPanel(shipment)}</div>`;
  return `${detailHeading}${tiles}${charts}${secondary}`;
}

function getSimulationInputs(form) {
  const data = new FormData(form);
  return {
    shipmentId: 'SIM-GCC-001',
    productId: data.get('productId'),
    eventType: data.get('eventType'),
    eventOnsetHours: Number(data.get('eventOnsetHours')),
    eventDurationHours: Number(data.get('eventDurationHours')),
    severity: Number(data.get('severity')),
    delayHours: Number(data.get('delayHours')),
    etaHours: Number(data.get('etaHours')),
    elapsedHours: Number(data.get('elapsedHours')),
    batchValueQar: Number(data.get('batchValueQar')),
    inspectionCostQar: Number(data.get('inspectionCostQar')),
    rerouteCostQar: Number(data.get('rerouteCostQar')),
    expeditionCostQar: Number(data.get('expeditionCostQar')),
    selectedSensor: data.get('selectedSensor'),
    seed: 424242
  };
}

function selected(value, expected) { return String(value) === String(expected) ? 'selected' : ''; }

function renderSimulationLab() {
  const i = state.simulationInput;
  const productOptions = state.products.map((product) => `<option value="${escapeHtml(product.id)}" ${selected(i.productId, product.id)}>${escapeHtml(product.name)}</option>`).join('');
  const eventOptions = [
    ['none', 'Normal route'], ['door_open', 'Door opening'], ['hot_handoff', 'Hot handoff'], ['cooling_failure', 'Cooling failure'],
    ['route_delay', 'Route delay'], ['sensor_drift', 'Sensor drift'], ['sensor_stuck', 'Sensor stuck'], ['sensor_dropout', 'Sensor dropout'], ['gps_dropout', 'GPS dropout']
  ].map(([id, label]) => `<option value="${id}" ${selected(i.eventType, id)}>${label}</option>`).join('');
  const stageOptions = ROUTE_OPTIONS.map((stage) => `<option value="${stage.hour}" ${Math.abs(i.eventOnsetHours - stage.hour) < 0.7 ? 'selected' : ''}>${stage.label}</option>`).join('');
  const result = state.simulationResult;
  const controls = `<form class="card form-card" id="simulationForm"><div class="section-kicker">Scenario controls</div><h2>Configure a synthetic trip</h2><p>Change one handling condition and see how the configured model responds. Every output below is simulated.</p><div class="form-grid">
      <div class="form-field"><label class="field-label" for="productId">Product model</label><select class="select-control" id="productId" name="productId">${productOptions}</select></div>
      <div class="form-field"><label class="field-label" for="eventType">Injected event</label><select class="select-control" id="eventType" name="eventType">${eventOptions}</select></div>
      <div class="form-field"><label class="field-label" for="eventStage">Event location · route stage</label><select class="select-control" id="eventStage" name="eventStage">${stageOptions}</select></div>
      <div class="form-field"><label class="field-label" for="eventOnsetHours">Event onset · trip hour</label><div class="range-field"><input id="eventOnsetHours" name="eventOnsetHours" type="range" min="0.5" max="10.5" step="0.25" value="${i.eventOnsetHours}"><span class="range-output" data-output-for="eventOnsetHours">${formatHours(i.eventOnsetHours, 2)} h</span></div></div>
      <div class="form-field"><label class="field-label" for="eventDurationHours">Event duration</label><div class="range-field"><input id="eventDurationHours" name="eventDurationHours" type="range" min="0.25" max="5" step="0.25" value="${i.eventDurationHours}"><span class="range-output" data-output-for="eventDurationHours">${formatHours(i.eventDurationHours, 2)} h</span></div></div>
      <div class="form-field"><label class="field-label" for="severity">Event severity</label><div class="range-field"><input id="severity" name="severity" type="range" min="0.1" max="1" step="0.01" value="${i.severity}"><span class="range-output" data-output-for="severity">${Math.round(i.severity * 100)}%</span></div></div>
      <div class="form-split"><div class="form-field"><label class="field-label" for="elapsedHours">Elapsed trip</label><input class="input-control" id="elapsedHours" name="elapsedHours" type="number" min="3" max="30" step="0.5" value="${i.elapsedHours}"></div><div class="form-field"><label class="field-label" for="etaHours">Base ETA</label><input class="input-control" id="etaHours" name="etaHours" type="number" min="0.25" max="72" step="0.25" value="${i.etaHours}"></div></div>
      <div class="form-split"><div class="form-field"><label class="field-label" for="delayHours">Route delay</label><input class="input-control" id="delayHours" name="delayHours" type="number" min="0" max="36" step="0.5" value="${i.delayHours}"></div><div class="form-field"><label class="field-label" for="batchValueQar">Batch value · QAR</label><input class="input-control" id="batchValueQar" name="batchValueQar" type="number" min="0" max="100000000" step="1000" value="${i.batchValueQar}"></div></div>
      <input type="hidden" name="selectedSensor" value="${escapeHtml(i.selectedSensor)}"><input type="hidden" name="inspectionCostQar" value="${i.inspectionCostQar}"><input type="hidden" name="rerouteCostQar" value="${i.rerouteCostQar}"><input type="hidden" name="expeditionCostQar" value="${i.expeditionCostQar}">
      <div class="assumption-note">Model parameters and costs are DEMO_INPUT. The advisor cannot change the physics estimate or clear product safety.</div>
      <button class="button button-primary" id="runSimulation" type="submit" ${state.isPlaying ? 'disabled' : ''}>▶ &nbsp;Run scenario</button>
    </div></form>`;
  let resultContent;
  if (!result) {
    resultContent = `<div class="card no-result"><div><div class="no-result-mark">⌁</div><h3>Your scenario is ready</h3><p>Inject a handoff or refrigeration event to compare quality debt, remaining shelf life, sensor trust, and constrained actions.</p><span class="badge badge-sim">SIMULATED QATAR / GCC SCENARIO</span></div></div>`;
  } else {
    const product = state.products.find((item) => item.id === result.productId) || state.products[0];
    const compare = state.simulationCompare;
    const q = result.qualityState;
    const simMapCard = `<article class="card sim-map-card"><div class="card-header"><div><h2 class="card-title">Simulated shipment route</h2><div class="card-subtitle">Move the marker through the illustrative Hamad Port–Doha corridor</div></div><span class="badge badge-sim">VISUAL SIMULATION</span></div><div class="sim-map-content"><div id="simulationRouteMap" class="interactive-map" role="application" aria-label="Interactive simulated shipment route map"></div><div class="sim-map-controls"><button class="button button-primary" id="toggleRouteAnimation" type="button" aria-pressed="false">▶ Animate route</button><button class="button" id="restartRouteAnimation" type="button">↺ Restart</button><span id="routeAnimationProgress" class="sim-map-progress">0% of illustrative trip</span><span id="routeAnimationState" class="sim-map-state">Ready · visual simulation only</span></div><div class="map-meta-row"><span class="map-basemap-status" data-map-status>Offline schematic · route tools still work</span><span class="map-safety-note">No live GPS · animation lasts about 3 seconds.</span></div></div></article>`;
    resultContent = `<div class="sim-results"><div class="sim-playback-row"><span class="badge badge-sim">${state.isPlaying ? `PLAYBACK · ${formatHours(result.elapsedHours, 1)} / ${formatHours(i.elapsedHours, 1)} h` : 'DETERMINISTIC SCENARIO'}</span><button type="button" class="button button-compact" id="playScenario" ${state.isPlaying ? 'disabled' : ''}>${state.isPlaying ? 'Playing…' : '▷ &nbsp;Play over time'}</button></div><div class="sim-result-top"><div class="card sim-output"><span>Remaining quality life · p50</span><strong>${formatHours(q.rsl_p50_hours)}</strong><small>h</small></div><div class="card sim-output"><span>Quality debt</span><strong>+${formatHours(q.qualityDebtHours, 1)}</strong><small>equiv. h</small></div><div class="card sim-output"><span>Lower-side arrival margin · p10</span><strong class="arrival-margin ${marginTone(q.rsl_p10_hours - result.etaHours)}">${formatHours(q.rsl_p10_hours - result.etaHours, 1)}</strong><small>p10 RSL − ETA · illustrative</small></div><div class="card sim-output"><span>Sensor trust</span><strong>${result.sensorTrust.score}</strong><small>%</small></div></div>${simMapCard}
      <article class="card"><div class="card-header"><div><h2 class="card-title">Multi-sensor temperature profile</h2><div class="card-subtitle">Configured setpoint ${product.referenceTemperatureC}°C · shaded interval marks a detected excursion</div></div>${statusBadge(result.status)}</div>${temperatureChart(result, product)}<div class="chart-legend"><span class="legend-item"><i class="legend-swatch"></i>Front</span><span class="legend-item"><i class="legend-swatch legend-centre"></i>Centre</span><span class="legend-item"><i class="legend-swatch legend-rear"></i>Rear</span><span class="legend-item"><i class="legend-swatch legend-door"></i>Door-side</span><span class="legend-item"><i class="legend-swatch legend-ref"></i>Configured reference</span><span class="legend-item"><i class="legend-swatch legend-event"></i>Detected event interval</span></div></article>${stageImpactCard(result, product)}
      <div class="comparison-cards"><article class="comparison-card"><h3>Normal route · configured reference handling</h3><strong>${formatHours(compare?.normal?.arrivalRslHours ?? Math.max(0, q.rsl_p50_hours - result.etaHours))} h</strong><p>p50 quality life at arrival. Lower-scenario margin: ${formatHours(compare?.normal?.arrivalMarginP10Hours ?? (q.rsl_p10_hours - result.etaHours), 1)} h (p10 RSL − ETA).</p></article><article class="comparison-card is-highlight"><h3>Intervention · expedite to Doha DC</h3><strong>${formatHours(compare?.intervention?.arrivalRslHours ?? 0)} h</strong><p>p50 at arrival. Lower-scenario margin: ${formatHours(compare?.intervention?.arrivalMarginP10Hours ?? (q.rsl_p10_hours - Math.max(0.25, result.etaHours - Math.min(3, result.etaHours * 0.45))), 1)} h. Scenario difference: +${formatHours(compare?.estimatedQualityHoursPreserved ?? 0, 1)} h quality life · ${formatQar(compare?.intervention?.costQar ?? i.expeditionCostQar)} DEMO_INPUT.</p></article></div>
      <div class="split-grid"><article class="card"><div class="card-header"><div><h2 class="card-title">Detected events</h2><div class="card-subtitle">Heuristic anomaly detector · grouped sensor signals</div></div><span class="badge badge-outline">${result.events.length} event${result.events.length === 1 ? '' : 's'}</span></div><div class="card-body">${renderEventList(result.events)}</div></article>${recommendationPanel(result)}</div>
      <div class="run-summary">${escapeHtml(compare?.assumption || 'All generated observations and estimates are simulated. Quality life does not determine whether food is safe.')}</div></div>`;
  }
  return `<div class="page-heading"><div><div class="eyebrow">Scenario designer · deterministic engine</div><h1>Simulation Lab</h1><p>Inject a route event, watch quality debt accumulate, and compare a constrained intervention under clear demo assumptions.</p></div><div class="heading-actions">${provenanceBadge('SIMULATION ONLY')}</div></div><div class="simulation-grid">${controls}<div>${resultContent}</div></div>`;
}

function renderEvaluationLab() {
  const summary = state.evaluation || {};
  const run = state.lastEvaluation || summary.latestRun;
  const metrics = run?.metrics;
  const metricCards = metrics ? `<div class="eval-results"><div class="eval-result"><span>Synthetic event recall</span><strong>${(metrics.eventRecall * 100).toFixed(0)}%</strong><small>Injected events detected · demo check</small></div><div class="eval-result"><span>Classification match</span><strong>${(metrics.eventClassificationMatch * 100).toFixed(0)}%</strong><small>Against injected event types</small></div><div class="eval-result"><span>False alerts / normal shipment</span><strong>${metrics.falseAlertsPerNormalShipment.toFixed(2)}</strong><small>Synthetic normal-route traces</small></div><div class="eval-result"><span>RSL MAE · measured labels</span><strong>—</strong><small>No calibrated RSL evaluation set</small></div></div>` : `<div class="eval-results"><div class="eval-result"><span>RSL MAE · hours</span><strong>—</strong><small>External quality data is not yet RSL-calibrated</small></div><div class="eval-result"><span>Event recall</span><strong>—</strong><small>Run the synthetic check below</small></div><div class="eval-result"><span>Warning lead time</span><strong>—</strong><small>No evaluated quality-failure time</small></div><div class="eval-result"><span>90% interval coverage</span><strong>—</strong><small>Uncertainty not calibrated</small></div></div>`;
  const dataRows = (summary.datasetReadiness || []).map((row) => `<div class="readiness-row"><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.usableFor)}</small></div><span class="badge badge-${row.type === 'SYNTHETIC' ? 'sim' : 'watch'}">${escapeHtml(row.state)}</span></div>`).join('');
  const baselineRows = (summary.baselineComparison || []).map((baseline) => `<tr><td><span class="baseline-name">${escapeHtml(baseline.name)}</span><small class="baseline-detail">${escapeHtml(baseline.method)} ${escapeHtml(baseline.readiness)}</small></td><td><span class="metric-na">— no labels</span></td><td><span class="metric-na">${baseline.id === 'B1' && metrics ? `${(metrics.eventRecall * 100).toFixed(0)}% sim` : '—'}</span></td><td><span class="metric-na">—</span></td><td><span class="metric-na">—</span></td></tr>`).join('');
  const foldOptions = run ? `<option value="all" ${state.evaluationFold === 'all' ? 'selected' : ''}>All route profiles</option>${run.foldMetrics.map((fold) => `<option value="${escapeHtml(fold.routeProfile)}" ${state.evaluationFold === fold.routeProfile ? 'selected' : ''}>${escapeHtml(fold.routeProfile)}</option>`).join('')}` : '<option value="all">No folds available</option>';
  const selectedFold = run?.foldMetrics.find((fold) => fold.routeProfile === state.evaluationFold);
  const foldBars = run ? `<article class="card"><div class="card-header"><div><h2 class="card-title">Synthetic event check by route profile</h2><div class="card-subtitle">Fold selector changes this grouped scenario view; it is not an empirical evaluation fold.</div></div><select class="select-control" id="evaluationFold">${foldOptions}</select></div><div class="card-body"><div class="fold-summary">${selectedFold ? `<div><span class="section-kicker">${escapeHtml(selectedFold.routeProfile)}</span><strong>${(selectedFold.eventRecall * 100).toFixed(0)}%</strong><small>synthetic event recall across ${selectedFold.shipmentCount} complete traces</small></div><div class="quality-row"><span>Injected events</span><strong>${selectedFold.injectedEventCount}</strong></div><div class="quality-row"><span>False alerts / normal trace</span><strong>${selectedFold.falseAlertsPerNormalShipment.toFixed(2)}</strong></div>` : `<div class="fold-bars">${run.foldMetrics.map((fold) => `<div class="fold-bar-row"><span>${escapeHtml(fold.routeProfile)}</span><span class="fold-bar-track"><i style="width:${Math.max(2, fold.eventRecall * 100)}%"></i></span><strong>${(fold.eventRecall * 100).toFixed(0)}%</strong></div>`).join('')}</div>`}</div></div></article>` : `<article class="card"><div class="card-header"><div><h2 class="card-title">Scenario folds</h2><div class="card-subtitle">Run a synthetic check to populate route groups.</div></div></div><div class="card-body"><div class="empty-state">No synthetic groups yet.</div></div></article>`;
  return `<div class="page-heading"><div><div class="eyebrow">Separate evaluation tracks · provenance first</div><h1>Evaluation Lab</h1><p>The synthetic event check and public strawberry weak-label benchmark answer different questions. Neither evaluates remaining shelf life, spoilage, or food safety.</p></div><div class="heading-actions">${provenanceBadge('SYNTHETIC CHECK AVAILABLE')}<a class="button button-compact" href="/synthetic-demo-pack.json" download="coldchain-guardian-synthetic-demo-pack.json">↓ &nbsp;Download 24 synthetic traces</a><button class="button button-primary" id="runEvaluation">▶ &nbsp;Run synthetic event check</button></div></div>
    <div class="eval-intro"><article class="card eval-status"><div class="eval-status-icon">!</div><div><h3>${run ? escapeHtml(run.provenance) : 'Real sensor and quality sources are available; product RSL is not trained'}</h3><p>${run ? escapeHtml(run.splitMethod) : 'The Python adapter layer now contains measured mango, milk, strawberry, apple, and retail records. Those sources have not been aligned and calibrated into the dashboard RSL model.'} RSL accuracy, interval coverage, spoilage, and food-safety claims still require a defined product endpoint and held-out evaluation.</p></div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Dataset readiness</h2><div class="card-subtitle">Source availability and valid use</div></div></div><div class="card-body"><div class="data-readiness">${dataRows}</div></div></article></div>
    <div class="group-note"><strong>Synthetic scenario evaluation:</strong> the downloadable pack contains 24 generated 10-hour traces with known injected events and detector output. It is useful for a reproducible demo, not an independent model test. The public benchmark is presented separately afterward and evaluates a weak, rule-derived future temperature-state label on observed US strawberry traces.</div>
    ${metricCards}
    <article class="card table-card"><div class="card-header"><div><h2 class="card-title">Synthetic baseline comparison</h2><div class="card-subtitle">RSL metrics remain unavailable; the event figures in this table describe only the synthetic detector check.</div></div><span class="badge badge-outline">${run ? `${run.shipmentCount} synthetic traces` : 'AWAITING SYNTHETIC RUN'}</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Model / status</th><th>RSL MAE · measured</th><th>Event recall · simulation</th><th>False alerts / shipment</th><th>90% coverage</th></tr></thead><tbody>${baselineRows}</tbody></table></div></article>
    <div class="group-note"><strong>Leakage policy:</strong> split by complete shipment or batch IDs. The public weak-label classifier below holds out complete shipment IDs, but it does not evaluate RSL. The synthetic event check groups generated traces by route profile.</div>
    <div class="split-grid" style="margin-top:14px"><article class="card"><div class="card-header"><div><h2 class="card-title">Metric limits & ablations</h2><div class="card-subtitle">Measured sources are ingested; a calibrated RSL evaluation target is not yet defined</div></div></div><div class="card-body"><ul class="limitations-list"><li>RSL MAE and RMSE need a product-specific failure or remaining-life endpoint aligned to each thermal history.</li><li>Spoilage precision, recall, AUROC, AUPRC, and Brier score need calibrated outcome labels.</li><li>Quality-failure warning lead time needs observed failure times.</li><li>90% interval coverage needs held-out, labelled quality outcomes.</li><li>Physics, ML residual, cross-sensor, and uncertainty ablations require grouped product-specific training.</li><li>Synthetic event recall checks code paths only, not field performance.</li></ul></div></article><article class="card"><div class="card-header"><div><h2 class="card-title">Last synthetic run</h2><div class="card-subtitle">Event detector only</div></div></div><div class="card-body">${run ? `<div class="quality-row"><span>Complete generated traces</span><strong>${run.shipmentCount}</strong></div><div class="quality-row"><span>Injected events</span><strong>${run.injectedEventCount}</strong></div><div class="quality-row"><span>Route profiles</span><strong>${run.routeProfiles.map(escapeHtml).join(' · ')}</strong></div><p class="small-muted">${escapeHtml(run.limitations?.[0] || 'Synthetic output is not empirical validation.')}</p>` : '<div class="empty-state">No run yet. Run the synthetic check to exercise event detection on complete demo traces.</div>'}</div></article></div>${foldBars}`;
}

function renderPublicEvaluation() {
  const result = state.publicBenchmarkEvaluation;
  const busy = state.publicEvaluationBusy;
  const metric = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
  const classifier = result?.metrics?.logisticRegression;
  const threshold = result?.metrics?.currentMaxThreshold;
  const cards = result ? `<div class="eval-results public-eval-results"><div class="eval-result"><span>Classifier F1</span><strong>${metric(classifier?.f1)}</strong><small>Held-out shipments pooled · weak label</small></div><div class="eval-result"><span>Classifier recall</span><strong>${metric(classifier?.recall)}</strong><small>Share of derived positives detected</small></div><div class="eval-result"><span>4°C rule F1</span><strong>${metric(threshold?.f1)}</strong><small>Transparent threshold baseline</small></div><div class="eval-result"><span>Classifier Brier score</span><strong>${metric(classifier?.brierScore)}</strong><small>Lower is better · rule labels only</small></div></div>` : '';
  const shipmentRows = (result?.perShipmentMetrics || []).map((fold) => `<tr><td><strong>${escapeHtml(fold.shipmentId)}</strong><small class="baseline-detail">Trained on the other ${Math.max(0, (result.shipmentCount || 1) - 1)} shipments</small></td><td>${new Intl.NumberFormat('en').format(fold.evaluatedRowCount)}</td><td>${metric(fold.logisticRegression?.f1)}</td><td>${metric(fold.currentMaxThreshold?.f1)}</td><td>${fold.logisticRegression?.falseNegative ?? '—'}</td></tr>`).join('');
  return `<section class="public-evaluation-section"><div class="page-heading public-eval-heading"><div><div class="eyebrow">Separate public weak-label benchmark · observed telemetry</div><h2>Early warning on the public strawberry data</h2><p>This classifier predicts the dataset release's derived “enter severe temperature state within 120 minutes” label. It is not a spoilage, RSL, or safety model, and its scores are not comparable to the synthetic event check above.</p></div><div class="heading-actions"><button class="button button-primary" id="runPublicBenchmark" ${busy ? 'disabled' : ''}>${busy ? 'Running six shipment holdouts…' : result ? '↻ &nbsp;Run public benchmark' : '▶ &nbsp;Run public benchmark'}</button></div></div>
    ${cards}<article class="card table-card"><div class="card-header"><div><h3 class="card-title">Leave-one-shipment-out results</h3><div class="card-subtitle">One whole shipment is held out per row; no time windows from it train that fold.</div></div><span class="badge badge-watch">${result ? `${result.shipmentCount} SHIPMENT FOLDS` : 'NOT RUN'}</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Held-out shipment</th><th>Rows</th><th>Learned F1</th><th>Rule F1</th><th>Learned false negatives</th></tr></thead><tbody>${shipmentRows || `<tr><td colspan="5"><span class="metric-na">Run the benchmark to calculate shipment-level results.</span></td></tr>`}</tbody></table></div></article>
    <div class="group-note"><strong>Read this carefully:</strong> the temperature measurements are observed, but R2 and the future R2 labels are derived by the dataset release from temperature rules. These metrics show generalization to held-out shipments for that rule-derived task only. Six shipments are a small sample. They do not validate food-spoilage prediction.</div>${result ? `<details class="public-method"><summary>Model and evaluation details</summary><p>${escapeHtml(result.splitMethod)}</p><p>${escapeHtml(result.model?.inputRule || '')}</p><p>${escapeHtml((result.limitations || []).join(' '))}</p></details>` : ''}</section>`;
}

function renderProductModels() {
  return `<div class="page-heading"><div><div class="eyebrow">Product model registry</div><h1>Product models</h1><p>Product-specific model cards show the configured kinetics, source limits, and quality endpoint for each demo product.</p></div><div class="heading-actions">${provenanceBadge('DEMO PARAMETERS')}</div></div><div class="product-grid">${state.products.map((product) => `<article class="card product-card"><div class="product-title-row"><span class="product-icon ${product.id === 'milk' ? 'is-milk' : ''}">${product.icon === 'milk' ? '◉' : '✿'}</span><div><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.category)} · ${escapeHtml(product.id)}</p></div><span class="badge badge-sim" style="margin-left:auto">${escapeHtml(product.groundTruthType)}</span></div><div class="product-param-grid"><div class="product-param"><span>Reference temperature</span><strong>${product.referenceTemperatureC}°C · DEMO_INPUT</strong></div><div class="product-param"><span>Configured nominal life</span><strong>${product.nominalShelfLifeHours} h · DEMO_INPUT</strong></div><div class="product-param"><span>Kinetic assumption</span><strong>Ea ${new Intl.NumberFormat('en').format(product.activationEnergyJMol)} J/mol · DEMO_INPUT</strong></div><div class="product-param"><span>Parameter provenance</span><strong>${escapeHtml(product.parameterSource)}</strong></div><div class="product-param"><span>Quality endpoint</span><strong>${escapeHtml(product.qualityEndpoint)}</strong></div><div class="product-param"><span>Supported sensor fields</span><strong>${product.supportedSensors.map(escapeHtml).join(' · ')}</strong></div><div class="product-param"><span>Validation dataset</span><strong>${escapeHtml(product.validationDataset)}</strong></div></div><ul class="product-limitations">${product.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><div class="product-foot"><span>Arrhenius equivalent-age demonstration</span><button class="subtle-link" data-view="simulation">Simulate →</button></div></article>`).join('')}</div>
    <div class="group-note"><strong>Safety boundary:</strong> these product models estimate a configured quality-age proxy. Neither a positive RSL nor the model registry is food-safety clearance.</div>`;
}

function renderEvidence() {
  const doc = state.evidence.find((item) => item.id === state.selectedEvidence);
  const meta = doc ? `<div class="evidence-document-meta"><span class="badge badge-sim">${escapeHtml(doc.authority)}</span><span class="badge badge-outline">${escapeHtml(doc.scope)}</span><span class="badge badge-outline">Effective ${escapeHtml(doc.effectiveDate)}</span></div>` : '';
  const content = state.selectedEvidenceContent;
  return `<div class="page-heading"><div><div class="eyebrow">Local evidence store · BM25-style offline retrieval</div><h1>Evidence</h1><p>Inspect the demo notes that ground the deterministic advisor. Each document states its scope and authority.</p></div><div class="heading-actions">${provenanceBadge('LOCAL MARKDOWN')}</div></div><div class="evidence-layout"><article class="card"><div class="card-header"><div><h2 class="card-title">Knowledge documents</h2><div class="card-subtitle">Demo-only notes · not approved SOPs</div></div></div><div class="evidence-list">${state.evidence.map((item) => `<button type="button" class="evidence-item-button ${item.id === state.selectedEvidence ? 'is-selected' : ''}" data-evidence-id="${escapeHtml(item.id)}"><span class="evidence-symbol">▧</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.scope)} · ${escapeHtml(item.authority)}</small></span></button>`).join('')}</div></article><article class="card evidence-detail"><div class="card-header"><div><h2 class="card-title">${escapeHtml(doc?.title || 'Evidence document')}</h2><div class="card-subtitle">Local Markdown rendered as plain text</div></div></div><div class="card-body">${meta}<pre class="markdown-content">${escapeHtml(content ?? 'Choose a document to inspect its full content. No evidence text is executed or interpreted as HTML.')}</pre></div></article></div>`;
}

async function openShipment(id) {
  try {
    state.selectedShipment = await api(`/api/shipments/${encodeURIComponent(id)}`);
    setCurrentView('shipment', 'Shipment detail');
  } catch (error) { toast(error.message); }
}

async function askAdvisor() {
  const shipment = state.selectedShipment;
  if (!shipment) return;
  const question = document.querySelector('#advisorQuestion')?.value || 'Why did you alert?';
  const target = document.querySelector('#advisorResponse');
  const button = document.querySelector('#askAdvisor');
  if (button) { button.disabled = true; button.textContent = 'Checking evidence…'; }
  if (target) target.innerHTML = '<div class="advisor-box"><p class="advisor-answer">Retrieving local evidence and preparing a deterministic explanation…</p></div>';
  try {
    const answer = await postJson('/api/advisor/query', { shipmentId: shipment.id, question });
    const reasons = (answer.reasoning_summary || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const refs = (answer.retrieval || []).filter((item) => item.relevance === 'MATCH').map((item) => `<div class="evidence-ref"><button type="button" data-evidence-id="${escapeHtml(item.documentId)}">${escapeHtml(item.title)}</button><small>${escapeHtml(item.scope)} · ${escapeHtml(item.authority)}</small></div>`).join('');
    target.innerHTML = `<div class="advisor-box"><p class="advisor-answer">${escapeHtml(answer.summary)}</p><ul class="advisor-reasons">${reasons}</ul><div class="quality-row"><span>Action · ${escapeHtml(answer.mode)}</span><strong>${escapeHtml(answer.recommended_action.replaceAll('_', ' '))}</strong></div><div class="quality-row"><span>Confidence</span><strong>${escapeHtml(answer.confidence.toUpperCase())} · human review required</strong></div>${answer.fallbackReason ? `<p class="small-muted">${escapeHtml(answer.fallbackReason)}</p>` : ''}<div class="evidence-mini">${refs}</div></div>`;
  } catch (error) {
    if (target) target.innerHTML = `<div class="advisor-box"><p class="advisor-answer">${escapeHtml(error.message)}</p></div>`;
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Ask Guardian'; }
  }
}

async function runSimulation(form) {
  state.simulationInput = getSimulationInputs(form);
  const button = document.querySelector('#runSimulation');
  if (button) { button.disabled = true; button.textContent = 'Running scenario…'; }
  try {
    const [result, comparison] = await Promise.all([
      postJson('/api/simulate', state.simulationInput),
      postJson('/api/simulate/compare', state.simulationInput)
    ]);
    state.simulationResult = result.shipment;
    state.simulationCompare = comparison;
    toast('Scenario recalculated · all outcomes are simulated.');
  } catch (error) { toast(error.message); }
  render();
}

async function playSimulation() {
  if (state.isPlaying) return;
  const form = document.querySelector('#simulationForm');
  if (!form) return;
  const original = getSimulationInputs(form);
  const start = Math.max(3, Math.min(original.eventOnsetHours - 1.5, original.elapsedHours - 1));
  const frames = [];
  for (let hour = start; hour < original.elapsedHours; hour += 1.5) frames.push(Number(hour.toFixed(2)));
  frames.push(original.elapsedHours);
  state.isPlaying = true;
  state.simulationCompare = null;
  try {
    for (const hour of frames) {
      state.simulationInput = { ...original, elapsedHours: hour };
      const result = await postJson('/api/simulate', state.simulationInput);
      state.simulationResult = result.shipment;
      render();
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    state.simulationInput = original;
    state.simulationCompare = await postJson('/api/simulate/compare', original);
  } catch (error) {
    toast(error.message);
  } finally {
    state.isPlaying = false;
    render();
  }
}

async function runEvaluation() {
  const button = document.querySelector('#runEvaluation');
  if (button) { button.disabled = true; button.textContent = 'Running grouped scenarios…'; }
  try {
    state.lastEvaluation = await postJson('/api/evaluation/run', {});
    state.evaluation = await api('/api/evaluation/summary');
    toast('Synthetic event check complete. It does not measure RSL performance.');
  } catch (error) { toast(error.message); }
  render();
}

async function loadEvidence(id) {
  state.selectedEvidence = id;
  state.selectedEvidenceContent = null;
  render();
  try {
    const document = await api(`/api/evidence/${encodeURIComponent(id)}`);
    state.selectedEvidenceContent = document.content;
  } catch (error) { state.selectedEvidenceContent = error.message; }
  render();
}

async function uploadTelemetryFile(fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const result = await postJson('/api/observations/ingest', payload);
    await loadData();
    await openShipment(result.summary.id);
    toast(result.notice);
  } catch (error) {
    toast(`Telemetry import failed: ${error.message}`);
  } finally {
    fileInput.value = '';
  }
}

async function runPublicBenchmark() {
  state.publicEvaluationBusy = true;
  if (state.view === 'evaluation') render();
  try {
    state.publicBenchmarkEvaluation = await postJson('/api/public-benchmark/evaluation/run', {});
    toast('Public benchmark complete. All six shipment groups were held out in turn.');
  } catch (error) {
    toast(error.message);
  } finally {
    state.publicEvaluationBusy = false;
    if (state.view === 'evaluation') render();
  }
}

async function openPublicShipment(id) {
  state.selectedPublicShipment = id;
  state.publicShipmentDetail = null;
  render();
  try {
    state.publicShipmentDetail = await api(`/api/public-benchmark/shipments/${encodeURIComponent(id)}`);
    render();
  } catch (error) {
    toast(error.message);
  }
}

function useScenario(id) {
  const shipment = state.selectedShipment?.id === id ? state.selectedShipment : null;
  if (!shipment) return;
  const scenario = shipment.scenario || {};
  state.simulationInput = {
    ...state.simulationInput,
    productId: shipment.productId,
    eventType: scenario.eventType || 'none',
    eventOnsetHours: scenario.eventOnsetHours ?? 4,
    eventDurationHours: scenario.eventDurationHours ?? 1,
    severity: scenario.severity ?? 0.6,
    delayHours: scenario.delayHours ?? 0,
    elapsedHours: scenario.elapsedHours ?? shipment.elapsedHours,
    etaHours: scenario.etaHours ?? Math.max(.5, shipment.etaHours - (scenario.delayHours ?? 0)),
    batchValueQar: scenario.batchValueQar ?? 42000,
    selectedSensor: scenario.selectedSensor ?? 'door'
  };
  state.simulationResult = null;
  state.simulationCompare = null;
  setCurrentView('simulation');
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-view]')) {
    event.preventDefault();
    setCurrentView(target.dataset.view);
    return;
  }
  if (target.matches('[data-public-shipment]')) return openPublicShipment(target.dataset.publicShipment);
  if (target.matches('[data-map-focus]')) {
    state.selectedMapShipmentId = target.dataset.mapFocus;
    activeMap?.focusShipment(state.selectedMapShipmentId);
    return;
  }
  if (target.matches('[data-field-dataset]')) {
    state.selectedFieldDataset = target.dataset.fieldDataset;
    render();
    return;
  }
  if (target.matches('[data-open-shipment]')) return openShipment(target.dataset.openShipment);
  if (target.matches('[data-evidence-id]')) return loadEvidence(target.dataset.evidenceId);
  if (target.matches('[data-use-scenario]')) return useScenario(target.dataset.useScenario);
  if (target.id === 'askAdvisor') return askAdvisor();
  if (target.id === 'runEvaluation') return runEvaluation();
  if (target.id === 'runPublicBenchmark') return runPublicBenchmark();
  if (target.id === 'playScenario') return playSimulation();
  if (target.id === 'toggleRouteAnimation') return activeMap?.toggleAnimation();
  if (target.id === 'restartRouteAnimation') return activeMap?.restartAnimation();
  if (target.id === 'importTelemetry') return document.querySelector('#telemetryFile')?.click();
  if (target.id === 'retryLoad' || target.id === 'refreshButton') return loadData();
  if (target.id === 'mobileMenu') {
    document.querySelector('#sidebar').classList.add('is-open');
    document.querySelector('#mobileScrim').classList.add('is-visible');
  }
  if (target.id === 'mobileScrim') {
    document.querySelector('#sidebar').classList.remove('is-open');
    document.querySelector('#mobileScrim').classList.remove('is-visible');
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'simulationForm') {
    event.preventDefault();
    runSimulation(event.target);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('input[type="range"]')) {
    const output = document.querySelector(`[data-output-for="${event.target.name}"]`);
    if (output) output.textContent = event.target.name === 'severity' ? `${Math.round(Number(event.target.value) * 100)}%` : `${Number(event.target.value).toFixed(2)} h`;
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'telemetryFile') uploadTelemetryFile(event.target);
  if (event.target.id === 'evaluationFold') {
    state.evaluationFold = event.target.value;
    render();
  }
  if (event.target.name === 'eventStage') {
    const slider = document.querySelector('#eventOnsetHours');
    const value = Number(event.target.value);
    if (slider) {
      slider.value = String(value);
      const output = document.querySelector('[data-output-for="eventOnsetHours"]');
      if (output) output.textContent = `${value.toFixed(2)} h`;
    }
  }
});

document.querySelector('#mobileScrim').addEventListener('click', () => {
  document.querySelector('#sidebar').classList.remove('is-open');
  document.querySelector('#mobileScrim').classList.remove('is-visible');
});

loadData();
