import { getStage } from './catalog.mjs';
import { assessSensorTrust, calculateQualityState, detectAnomalies, normalizeSimulationInput, recommendActions, shipmentSummary, simulateShipment } from './engine.mjs';

const SHIPMENTS = new Map();
const INGESTED = new Map();
let uploadIdSequence = 0;

function createUploadId() {
  const base = `UPLOAD-${Date.now()}`;
  let id = base;
  while (SHIPMENTS.has(id) || INGESTED.has(id)) id = `${base}-${++uploadIdSequence}`;
  return id;
}

const DEMO_SCENARIOS = [
  { shipmentId: 'QA-HEALTHY-001', productId: 'milk', eventType: 'none', eventOnsetHours: 4, eventDurationHours: 1, severity: 0, elapsedHours: 9.5, etaHours: 4, delayHours: 0, seed: 11000 },
  { shipmentId: 'QA-STRAW-001', productId: 'strawberry', eventType: 'hot_handoff', eventOnsetHours: 3.25, eventDurationHours: 0.75, severity: 0.72, elapsedHours: 10.5, etaHours: 4.0, delayHours: 0.5, seed: 11001 },
  { shipmentId: 'QA-MILK-001', productId: 'milk', eventType: 'door_open', eventOnsetHours: 7.0, eventDurationHours: 1.5, severity: 0.8, elapsedHours: 12, etaHours: 5.5, seed: 11002 },
  { shipmentId: 'QA-SENSOR-FAULT-001', productId: 'strawberry', eventType: 'sensor_drift', eventOnsetHours: 5, eventDurationHours: 4, severity: 0.8, selectedSensor: 'front', elapsedHours: 12, etaHours: 6.5, seed: 11003 },
  { shipmentId: 'QA-DROPOUT-001', productId: 'milk', eventType: 'sensor_dropout', eventOnsetHours: 8, eventDurationHours: 3, severity: 0.8, selectedSensor: 'rear', elapsedHours: 12, etaHours: 7, seed: 11004 },
  { shipmentId: 'QA-CRITICAL-001', productId: 'strawberry', eventType: 'cooling_failure', eventOnsetHours: 4, eventDurationHours: 5.25, severity: 0.98, elapsedHours: 12, etaHours: 7.5, delayHours: 2, seed: 11005 }
];

for (const scenario of DEMO_SCENARIOS) {
  const shipment = simulateShipment(scenario);
  SHIPMENTS.set(shipment.id, shipment);
}

export function listShipments() {
  return [...SHIPMENTS.values(), ...INGESTED.values()].map(shipmentSummary);
}

export function getShipment(id) {
  return SHIPMENTS.get(id) ?? INGESTED.get(id) ?? null;
}

export function listAlerts() {
  return [...SHIPMENTS.values(), ...INGESTED.values()]
    .flatMap((shipment) => shipment.events.map((event) => ({ ...event, productName: shipment.productName, status: shipment.status, source: shipment.source, groundTruthType: shipment.groundTruthType })))
    .sort((a, b) => b.startHour - a.startHour);
}

export function getFleetSnapshot() {
  const all = [...SHIPMENTS.values(), ...INGESTED.values()];
  const sourceCounts = {
    simulated: all.filter((item) => item.source === 'SIMULATED').length,
    userSupplied: all.filter((item) => item.source === 'USER_SUPPLIED').length
  };
  const source = !all.length ? 'NONE'
    : sourceCounts.simulated === all.length ? 'SIMULATED'
      : sourceCounts.userSupplied === all.length ? 'USER_SUPPLIED'
        : 'MIXED';
  return {
    activeShipments: all.length,
    healthy: all.filter((item) => item.status === 'HEALTHY').length,
    atRisk: all.filter((item) => item.status === 'AT RISK' || item.status === 'WATCH').length,
    inspectionRequired: all.filter((item) => ['CRITICAL', 'AT RISK'].includes(item.status) || item.sensorTrust.score < 50).length,
    critical: all.filter((item) => item.status === 'CRITICAL').length,
    qualityDebtHours: Number(all.reduce((sum, item) => sum + item.qualityState.qualityDebtHours, 0).toFixed(1)),
    source,
    sourceCounts,
    handoffSummary: 'Handoff excursions in this demo are injected scenario events. They do not describe actual port operations.'
  };
}

export function ingestObservations(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Body must be a JSON object.');
  if (payload.temperatureUnit !== undefined && payload.temperatureUnit !== 'C') throw new Error('temperatureUnit must be C. Convert Fahrenheit values before upload.');
  if (!Array.isArray(payload.observations) || payload.observations.length < 2) throw new Error('observations must contain at least two readings.');
  if (payload.observations.length > 20000) throw new Error('A request may contain at most 20,000 readings.');
  const productId = typeof payload.productId === 'string' ? payload.productId : 'strawberry';
  const requestedId = typeof payload.shipmentId === 'string' ? payload.shipmentId.slice(0, 48) : '';
  const id = requestedId || createUploadId();
  if (SHIPMENTS.has(id) || INGESTED.has(id)) throw new Error(`Shipment ID already exists: ${id}`);
  const seedInput = normalizeSimulationInput({ shipmentId: id, productId, etaHours: payload.etaHours ?? 4, eventType: 'none' });
  const allowedSensors = new Set(['front', 'centre', 'rear', 'door']);
  const points = [];
  for (const [index, row] of payload.observations.entries()) {
    if (!row || typeof row !== 'object') throw new Error(`observations[${index}] must be an object.`);
    const timestamp = Date.parse(row.timestampUtc ?? row.timestamp ?? '');
    if (!Number.isFinite(timestamp)) throw new Error(`observations[${index}] needs a valid timestampUtc.`);
    const sensorId = String(row.sensorId ?? 'centre').toLowerCase();
    if (!allowedSensors.has(sensorId)) throw new Error(`observations[${index}].sensorId must be front, centre, rear, or door.`);
    const temperatureC = Number(row.temperatureC);
    if (row.temperatureC === null || row.temperatureC === undefined || !Number.isFinite(temperatureC) || temperatureC < -50 || temperatureC > 80) throw new Error(`observations[${index}].temperatureC must be between -50 and 80°C.`);
    points.push({ timestamp, sensorId, temperatureC, humidity: Number.isFinite(Number(row.relativeHumidityPct)) ? Number(row.relativeHumidityPct) : null, latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null, longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  const firstTimestamp = points[0].timestamp;
  const grouped = new Map();
  for (const point of points) {
    const key = point.timestamp;
    const item = grouped.get(key) ?? { timestamp: point.timestamp, temperatureReadings: {}, humidity: [], latitudes: [], longitudes: [] };
    const aggregate = item.temperatureReadings[point.sensorId] ?? { sum: 0, count: 0 };
    aggregate.sum += point.temperatureC;
    aggregate.count += 1;
    item.temperatureReadings[point.sensorId] = aggregate;
    if (point.humidity !== null) item.humidity.push(point.humidity);
    if (point.latitude !== null) item.latitudes.push(point.latitude);
    if (point.longitude !== null) item.longitudes.push(point.longitude);
    grouped.set(key, item);
  }
  const samples = [...grouped.values()].map((item) => ({
    timestampUtc: new Date(item.timestamp).toISOString(),
    elapsedHours: Number(((item.timestamp - firstTimestamp) / 3600000).toFixed(4)),
    stage: typeof payload.routeStage === 'string' ? payload.routeStage.slice(0, 48) : 'UNKNOWN',
    setpointC: Number.isFinite(Number(payload.setpointC)) ? Number(payload.setpointC) : 4,
    ambientTemperatureC: null,
    temperaturesC: Object.fromEntries(['front', 'centre', 'rear', 'door'].map((sensorId) => {
      const aggregate = item.temperatureReadings[sensorId];
      return [sensorId, aggregate ? aggregate.sum / aggregate.count : null];
    })),
    relativeHumidityPct: item.humidity.length ? item.humidity.reduce((a, b) => a + b, 0) / item.humidity.length : null,
    latitude: item.latitudes.length ? item.latitudes.reduce((a, b) => a + b, 0) / item.latitudes.length : null,
    longitude: item.longitudes.length ? item.longitudes.reduce((a, b) => a + b, 0) / item.longitudes.length : null,
    groundTruthType: 'UNKNOWN'
  }));
  if (samples.length < 2) throw new Error('At least two unique timestamps are required after duplicate readings are combined.');
  seedInput.shipmentId = id;
  seedInput.elapsedHours = samples.at(-1).elapsedHours;
  const shipment = {
    id,
    productId,
    productName: seedInput.productId === productId ? (payload.productName || productId) : productId,
    currentStage: typeof payload.routeStage === 'string' ? payload.routeStage.slice(0, 48) : getStage(seedInput.elapsedHours).id,
    elapsedHours: seedInput.elapsedHours,
    etaHours: seedInput.etaHours,
    status: 'WATCH',
    source: 'USER_SUPPLIED',
    groundTruthType: 'UNKNOWN',
    truth: null,
    scenario: seedInput,
    samples,
    route: [],
    injectedEvent: null
  };
  shipment.sensorTrust = assessSensorTrust(shipment);
  shipment.events = detectAnomalies(shipment);
  shipment.qualityState = calculateQualityState(shipment);
  shipment.actions = recommendActions(shipment, shipment.qualityState);
  shipment.recommendation = shipment.actions.find((candidate) => candidate.eligibility === 'ELIGIBLE') ?? shipment.actions[0];
  shipment.status = shipment.qualityState.arrivalMarginHours <= 0 ? 'AT RISK' : shipment.events.length ? 'WATCH' : 'HEALTHY';
  INGESTED.set(id, shipment);
  return shipment;
}
