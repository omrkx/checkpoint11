import { getProduct, getStage, ROUTE_STAGES, MODEL_VERSION } from './catalog.mjs';

const SENSOR_IDS = ['front', 'centre', 'rear', 'door'];
const SENSOR_LABELS = { front: 'Front pallet', centre: 'Centre pallet', rear: 'Rear pallet', door: 'Door-side pallet' };
const EVENT_TYPES = new Set(['none', 'cooling_failure', 'door_open', 'hot_handoff', 'route_delay', 'sensor_drift', 'sensor_stuck', 'sensor_dropout', 'gps_dropout']);
const MIN_OUTAGE_RUN_SAMPLES = 2;
const MIN_STUCK_RUN_SAMPLES = 6;
const MIN_STUCK_PEER_STDDEV_C = 0.05;
const R_GAS = 8.314462618;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function arrheniusRate(temperatureC, product, activationEnergy = product.activationEnergyJMol) {
  const tempK = temperatureC + 273.15;
  const referenceK = product.referenceTemperatureC + 273.15;
  const exponent = -activationEnergy / R_GAS * (1 / tempK - 1 / referenceK);
  return clamp(Math.exp(exponent), 0.02, 25);
}

function logisticNoise(random, spread = 0.2) {
  return (random() + random() + random() + random() - 2) * spread;
}

export function normalizeSimulationInput(input = {}) {
  for (const field of ['eventOnsetHours', 'eventDurationHours', 'severity', 'delayHours', 'batchValueQar', 'inspectionCostQar', 'rerouteCostQar', 'expeditionCostQar', 'elapsedHours', 'etaHours', 'seed']) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== '' && !Number.isFinite(Number(input[field]))) throw new Error(`${field} must be a finite number.`);
  }
  const productId = typeof input.productId === 'string' ? input.productId : 'strawberry';
  if (!getProduct(productId)) throw new Error(`Unknown productId: ${productId}`);
  const eventType = typeof input.eventType === 'string' ? input.eventType : 'none';
  if (!EVENT_TYPES.has(eventType)) throw new Error(`Unsupported eventType: ${eventType}`);
  return {
    shipmentId: typeof input.shipmentId === 'string' ? input.shipmentId.slice(0, 48) : 'SIM-GCC-001',
    productId,
    eventType,
    eventOnsetHours: clamp(Number(input.eventOnsetHours ?? 5.5), 0, 30),
    eventDurationHours: clamp(Number(input.eventDurationHours ?? 1.25), 0.25, 12),
    severity: clamp(Number(input.severity ?? 0.65), 0, 1),
    delayHours: clamp(Number(input.delayHours ?? (eventType === 'route_delay' ? input.eventDurationHours ?? 2 : 0)), 0, 36),
    batchValueQar: clamp(Number(input.batchValueQar ?? 42000), 0, 100000000),
    inspectionCostQar: clamp(Number(input.inspectionCostQar ?? 180), 0, 1000000),
    rerouteCostQar: clamp(Number(input.rerouteCostQar ?? 950), 0, 1000000),
    expeditionCostQar: clamp(Number(input.expeditionCostQar ?? 520), 0, 1000000),
    elapsedHours: clamp(Number(input.elapsedHours ?? 12), 3, 30),
    etaHours: clamp(Number(input.etaHours ?? 4.5), 0.25, 72),
    seed: Number.isFinite(Number(input.seed)) ? Number(input.seed) >>> 0 : 424242,
    selectedSensor: SENSOR_IDS.includes(input.selectedSensor) ? input.selectedSensor : 'door'
  };
}

function eventWindow(scenario) {
  return [scenario.eventOnsetHours, scenario.eventOnsetHours + scenario.eventDurationHours];
}

export function simulateShipment(rawInput = {}) {
  const scenario = normalizeSimulationInput(rawInput);
  const product = getProduct(scenario.productId);
  const random = seededRandom(scenario.seed);
  const samples = [];
  const stepHours = 0.25;
  const sampleCount = Math.ceil(scenario.elapsedHours / stepHours);
  const [eventStart, eventEnd] = eventWindow(scenario);
  const startUtc = Date.parse('2026-09-25T04:00:00Z') - scenario.elapsedHours * 3600000;
  const sensorMemory = Object.fromEntries(SENSOR_IDS.map((id) => [id, null]));

  for (let index = 0; index <= sampleCount; index += 1) {
    const hour = Math.min(index * stepHours, scenario.elapsedHours);
    const withinEvent = hour >= eventStart && hour <= eventEnd;
    const eventProgress = withinEvent ? clamp((hour - eventStart) / Math.max(scenario.eventDurationHours, 0.25), 0, 1) : 0;
    const recovery = hour > eventEnd ? Math.exp(-(hour - eventEnd) / 0.85) : 0;
    const broadWarmup = scenario.eventType === 'hot_handoff' && hour > eventStart ? scenario.severity * 4.8 * (withinEvent ? 0.55 + eventProgress * 0.45 : recovery) : 0;
    const trueCoolingFailure = scenario.eventType === 'cooling_failure' && (withinEvent ? scenario.severity * 10.5 * Math.max(0.1, eventProgress) : hour > eventEnd ? scenario.severity * 7.5 * recovery : 0);
    const values = {};
    for (const [sensorIndex, sensorId] of SENSOR_IDS.entries()) {
      const positionWave = Math.sin(hour * 0.72 + sensorIndex * 0.9) * 0.16;
      const base = product.referenceTemperatureC + 0.16 + positionWave + logisticNoise(random, 0.28);
      let temperature = base + trueCoolingFailure;
      if (scenario.eventType === 'door_open' && withinEvent && ['rear', 'door'].includes(sensorId)) {
        temperature += scenario.severity * 8.2 * (0.75 + 0.25 * Math.sin(Math.PI * eventProgress));
      }
      if (scenario.eventType === 'hot_handoff' && sensorId !== 'front') temperature += broadWarmup;
      if (scenario.eventType === 'sensor_drift' && sensorId === scenario.selectedSensor && hour >= eventStart) {
        temperature += scenario.severity * Math.min(hour - eventStart, scenario.eventDurationHours + 2) * 0.48;
      }
      if (scenario.eventType === 'sensor_stuck' && sensorId === scenario.selectedSensor && hour >= eventStart) {
        if (sensorMemory[sensorId] === null) sensorMemory[sensorId] = temperature;
        temperature = sensorMemory[sensorId];
      }
      const dropped = scenario.eventType === 'sensor_dropout' && sensorId === scenario.selectedSensor && withinEvent;
      values[sensorId] = dropped ? null : Number(temperature.toFixed(2));
      if (!dropped && scenario.eventType !== 'sensor_stuck') sensorMemory[sensorId] = values[sensorId];
    }

    const gpsMissing = scenario.eventType === 'gps_dropout' && withinEvent;
    // Route stage follows the same elapsed-trip clock as the selected event stage.
    const stage = getStage(hour);
    samples.push({
      timestampUtc: new Date(startUtc + hour * 3600000).toISOString(),
      elapsedHours: Number(hour.toFixed(2)),
      stage: stage.id,
      setpointC: product.referenceTemperatureC,
      ambientTemperatureC: 39 + Math.sin(hour / 3) * 2,
      temperaturesC: values,
      relativeHumidityPct: Number((76 + Math.sin(hour * 0.23) * 4).toFixed(1)),
      latitude: gpsMissing ? null : Number((25.2865 - Math.min(hour, 18) * 0.0017).toFixed(5)),
      longitude: gpsMissing ? null : Number((51.5330 + Math.min(hour, 18) * 0.0011).toFixed(5)),
      groundTruthType: scenario.eventType === 'none' ? 'PHYSICS_SIMULATED' : 'SYNTHETIC_EVENT'
    });
  }

  const truth = scenario.eventType === 'none' ? null : {
    eventType: scenario.eventType,
    startHour: scenario.eventOnsetHours,
    endHour: scenario.eventOnsetHours + scenario.eventDurationHours,
    severity: scenario.severity,
    sensor: ['sensor_drift', 'sensor_stuck', 'sensor_dropout'].includes(scenario.eventType) ? scenario.selectedSensor : null
  };
  const shipment = {
    id: scenario.shipmentId,
    productId: scenario.productId,
    productName: product.name,
    currentStage: samples.at(-1)?.stage ?? 'PORT',
    elapsedHours: scenario.elapsedHours,
    etaHours: scenario.etaHours + scenario.delayHours,
    status: 'WATCH',
    source: 'SIMULATED',
    groundTruthType: 'PHYSICS_SIMULATED',
    truth,
    scenario,
    samples,
    route: ROUTE_STAGES.map((stage) => ({ ...stage, complete: stage.hour <= scenario.elapsedHours, current: stage.id === samples.at(-1)?.stage }))
  };
  shipment.sensorTrust = assessSensorTrust(shipment);
  shipment.events = detectAnomalies(shipment);
  shipment.qualityState = calculateQualityState(shipment);
  shipment.actions = recommendActions(shipment, shipment.qualityState);
  shipment.recommendation = shipment.actions.find((candidate) => candidate.eligibility === 'ELIGIBLE') ?? shipment.actions[0];
  shipment.status = shipment.qualityState.arrivalMarginHours <= 0 || shipment.events.some((event) => event.severity === 'CRITICAL')
    ? 'CRITICAL'
    : shipment.events.some((event) => event.severity === 'HIGH') || shipment.qualityState.arrivalMarginHours <= 18
      ? 'AT RISK'
      : shipment.events.length || shipment.qualityState.arrivalMarginHours <= 48
        ? 'WATCH'
        : 'HEALTHY';
  return shipment;
}

function aggregateSamples(shipment) {
  return shipment.samples.map((sample) => {
    const values = Object.values(sample.temperaturesC).filter(Number.isFinite);
    return { ...sample, aggregateTemperatureC: median(values) ?? sample.setpointC };
  });
}

function equivalentAge(samples, product, activationEnergy = product.activationEnergyJMol, noiseFn = null) {
  let age = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const duration = Math.max(0, current.elapsedHours - previous.elapsedHours);
    const t0 = previous.aggregateTemperatureC + (noiseFn?.() ?? 0);
    const t1 = current.aggregateTemperatureC + (noiseFn?.() ?? 0);
    age += duration * (arrheniusRate(t0, product, activationEnergy) + arrheniusRate(t1, product, activationEnergy)) / 2;
  }
  return age;
}

function baselinePredictions(samples, product, physicalAgeHours, physicsRslHours) {
  let degreeHours = 0;
  let thresholdExceeded = false;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const excess = Math.max(0, sample.aggregateTemperatureC - (product.referenceTemperatureC + 2));
    if (index > 0) {
      const previous = samples[index - 1];
      const previousExcess = Math.max(0, previous.aggregateTemperatureC - (product.referenceTemperatureC + 2));
      const duration = Math.max(0, sample.elapsedHours - previous.elapsedHours);
      degreeHours += (excess + previousExcess) * 0.5 * duration;
    }
    if (sample.aggregateTemperatureC > product.referenceTemperatureC + 2) thresholdExceeded = true;
  }
  const staticRsl = Math.max(0, product.nominalShelfLifeHours - physicalAgeHours);
  const degreeHourRsl = Math.max(0, staticRsl - degreeHours * 0.8);
  return [
    { id: 'B0', name: 'Static expiry', rslHours: Number(staticRsl.toFixed(1)), available: true, provenance: 'DEMO_INPUT', note: 'Ignores temperature history.' },
    { id: 'B1', name: 'Temperature threshold', triggered: thresholdExceeded, rslHours: null, available: true, provenance: 'RULE_BASELINE', note: thresholdExceeded ? 'Configured threshold crossed; threshold alone does not estimate RSL.' : 'No configured threshold crossing.' },
    { id: 'B2', name: 'Degree-hours', rslHours: Number(degreeHourRsl.toFixed(1)), degreeHours: Number(degreeHours.toFixed(1)), available: true, provenance: 'DEMO_INPUT', note: 'Uses an illustrative 0.8 equivalent-hour per degree-hour coefficient.' },
    { id: 'B3', name: 'Physics only', rslHours: Number(physicsRslHours.toFixed(1)), available: true, provenance: 'DEMO_INPUT', note: 'Arrhenius equivalent-age model; illustrative parameters.' },
    { id: 'B4', name: 'ML only', rslHours: null, available: false, provenance: 'NO_LABELS', note: 'Requires measured product quality labels for fitting.' },
    { id: 'B5', name: 'Physics + ML residual', rslHours: Number(physicsRslHours.toFixed(1)), available: true, correctionActive: false, correctionHours: 0, provenance: 'PHYSICS_FALLBACK', note: 'Falls back to physics while no labelled residual model is trained.' }
  ];
}

export function assessSensorTrust(shipment) {
  const recent = shipment.samples.slice(-Math.min(12, shipment.samples.length));
  const flags = [];
  let faultPenalty = 0;
  for (const sensorId of SENSOR_IDS) {
    const values = recent.map((sample) => sample.temperaturesC[sensorId]).filter(Number.isFinite);
    const missingRatio = 1 - values.length / Math.max(recent.length, 1);
    if (missingRatio > 0.2) {
      flags.push({ sensorId, type: 'SENSOR_DROPOUT', detail: `${Math.round(missingRatio * 100)}% of recent readings are missing.` });
      faultPenalty += Math.min(32, missingRatio * 42);
    }
    if (values.length >= 6 && new Set(values.map((value) => value.toFixed(2))).size <= 2) {
      const peers = recent.map((sample) => median(Object.entries(sample.temperaturesC).filter(([id, value]) => id !== sensorId && Number.isFinite(value)).map(([, value]) => value))).filter(Number.isFinite);
      if (peers.length && Math.abs(median(values) - median(peers)) > 0.8) {
        flags.push({ sensorId, type: 'SENSOR_STUCK', detail: 'This channel is nearly flat while peer sensors continue to vary.' });
        faultPenalty += 28;
      }
    }
    const peerDiffs = recent.map((sample) => {
      const value = sample.temperaturesC[sensorId];
      const peerValues = Object.entries(sample.temperaturesC).filter(([id, peer]) => id !== sensorId && Number.isFinite(peer)).map(([, peer]) => peer);
      return Number.isFinite(value) && peerValues.length ? value - median(peerValues) : null;
    }).filter(Number.isFinite);
    if (peerDiffs.length >= 5 && median(peerDiffs.slice(-5)) > 1.2) {
      flags.push({ sensorId, type: 'SENSOR_DRIFT', detail: 'This channel is warming away from peer sensors.' });
      faultPenalty += 23;
    }
  }
  const peerSpread = recent.map((sample) => {
    const values = Object.values(sample.temperaturesC).filter(Number.isFinite);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  });
  const highSpread = peerSpread.filter((spread) => spread > 2.5).length / Math.max(peerSpread.length, 1);
  if (highSpread > 0.3 && !flags.some((flag) => ['SENSOR_DRIFT', 'SENSOR_STUCK'].includes(flag.type))) {
    flags.push({ sensorId: null, type: 'PEER_DISAGREEMENT', detail: 'Sensor positions disagree; a local warm zone is possible.' });
    faultPenalty += 12;
  }
  const missingGps = recent.filter((sample) => sample.latitude === null || sample.longitude === null).length;
  if (missingGps / Math.max(recent.length, 1) > 0.2) {
    flags.push({ sensorId: null, type: 'GPS_DROPOUT', detail: 'Location updates are missing while temperature data continue.' });
    faultPenalty += 8;
  }
  const score = Math.round(clamp(100 - faultPenalty, 12, 99));
  return { score, label: score >= 85 ? 'HIGH' : score >= 65 ? 'MODERATE' : 'LOW', flags, method: 'Heuristic peer-consistency checks' };
}

export function detectAnomalies(shipment) {
  const product = getProduct(shipment.productId);
  const samples = aggregateSamples(shipment);
  const events = [];
  const warmThreshold = product.referenceTemperatureC + 2.5;
  let open = null;
  for (const sample of samples) {
    if (sample.aggregateTemperatureC >= warmThreshold) {
      if (!open) open = { start: sample.elapsedHours, end: sample.elapsedHours, max: sample.aggregateTemperatureC, count: 1 };
      else { open.end = sample.elapsedHours; open.max = Math.max(open.max, sample.aggregateTemperatureC); open.count += 1; }
    } else if (open) {
      if (open.count >= 2) {
        const duration = open.end - open.start + 0.25;
        const crossSensor = samples.filter((item) => item.elapsedHours >= open.start && item.elapsedHours <= open.end)
          .filter((item) => Object.values(item.temperaturesC).filter(Number.isFinite).filter((value) => value >= warmThreshold).length >= 2).length;
        const eventType = crossSensor >= 2 ? (duration <= 1.5 ? 'DOOR_OPEN' : 'COOLING_FAILURE') : 'UNKNOWN_EXCURSION';
        events.push(makeEvent(shipment, eventType, open.start, open.end, open.max, duration, 'temperature trace'));
      }
      open = null;
    }
  }
  if (open && open.count >= 2) {
    const duration = open.end - open.start + 0.25;
    const crossSensor = samples.filter((item) => item.elapsedHours >= open.start && item.elapsedHours <= open.end)
      .filter((item) => Object.values(item.temperaturesC).filter(Number.isFinite).filter((value) => value >= warmThreshold).length >= 2).length;
    events.push(makeEvent(shipment, crossSensor >= 2 ? (duration <= 1.5 ? 'DOOR_OPEN' : 'COOLING_FAILURE') : 'UNKNOWN_EXCURSION', open.start, open.end, open.max, duration, 'temperature trace'));
  }

  events.push(...detectTelemetryFaultEvents(shipment));
  for (const flag of shipment.sensorTrust.flags) {
    const mapped = flag.type === 'SENSOR_DROPOUT' ? 'SENSOR_DROPOUT' : flag.type;
    const recentWindowStart = Math.max(0, shipment.elapsedHours - 3);
    const recentWindowEnd = shipment.elapsedHours;
    const alreadyRepresented = events.some((event) => event.type === mapped
      && (!flag.sensorId || event.affectedSensors.includes(flag.sensorId))
      && event.endHour >= recentWindowStart
      && event.startHour <= recentWindowEnd);
    if (alreadyRepresented) continue;
    events.push({
      eventId: `${shipment.id}-${mapped}-${flag.sensorId ?? 'fleet'}`,
      shipmentId: shipment.id,
      type: mapped,
      startHour: Math.max(0, shipment.elapsedHours - 3),
      endHour: shipment.elapsedHours,
      severity: mapped === 'SENSOR_DRIFT' || mapped === 'SENSOR_STUCK' ? 'MEDIUM' : 'LOW',
      confidence: 0.64,
      affectedSensors: flag.sensorId ? [flag.sensorId] : SENSOR_IDS,
      evidence: [flag.detail],
      groundTruthType: shipment.truth?.eventType === mapped.toLowerCase() ? 'SYNTHETIC_EVENT' : 'MODEL_ESTIMATE'
    });
  }
  if (shipment.scenario.eventType === 'route_delay' || shipment.scenario.delayHours >= 2) {
    events.push({
      eventId: `${shipment.id}-DELAY`, shipmentId: shipment.id, type: 'DELAY',
      startHour: Math.max(0, shipment.elapsedHours - shipment.scenario.delayHours), endHour: shipment.elapsedHours,
      severity: shipment.scenario.delayHours >= 6 ? 'HIGH' : 'MEDIUM', confidence: 0.82, affectedSensors: [],
      evidence: [`Estimated route delay is ${shipment.scenario.delayHours.toFixed(1)} hours.`, 'Route delay is an input to this synthetic scenario.'],
      groundTruthType: 'SYNTHETIC_EVENT'
    });
  }
  if (shipment.samples.filter((sample) => sample.latitude === null).length > shipment.samples.length * 0.2 && !events.some((event) => event.type === 'GPS_DROPOUT')) {
    events.push({ eventId: `${shipment.id}-GPS_DROPOUT`, shipmentId: shipment.id, type: 'GPS_DROPOUT', startHour: Math.max(0, shipment.elapsedHours - 3), endHour: shipment.elapsedHours, severity: 'LOW', confidence: 0.61, affectedSensors: [], evidence: ['Several location points are missing while temperature readings continue.'], groundTruthType: 'MODEL_ESTIMATE' });
  }
  return events;
}

function detectTelemetryFaultEvents(shipment) {
  const events = [];
  const samples = shipment.samples;

  for (const sensorId of SENSOR_IDS) {
    const dropoutRuns = consecutiveRuns(samples, (sample) => !Number.isFinite(sample.temperaturesC[sensorId]));
    for (const run of dropoutRuns.filter((items) => items.length >= MIN_OUTAGE_RUN_SAMPLES)) {
      events.push(makeTelemetryFaultEvent(shipment, 'SENSOR_DROPOUT', run, sensorId, `${sensorId} temperature readings were missing for ${run.length} consecutive samples.`));
    }

    for (const run of findStuckRuns(samples, sensorId)) {
      const peerMedians = run.map((sample) => median(Object.entries(sample.temperaturesC)
        .filter(([id, value]) => id !== sensorId && Number.isFinite(value))
        .map(([, value]) => value))).filter(Number.isFinite);
      const sensorReadings = run.map((sample) => sample.temperaturesC[sensorId]);
      const peerStdDev = standardDeviation(peerMedians);
      const sensorStdDev = standardDeviation(sensorReadings);
      const requiredPeerStdDev = Math.max(MIN_STUCK_PEER_STDDEV_C, sensorStdDev * 3);
      if (peerMedians.length >= MIN_STUCK_RUN_SAMPLES && peerStdDev > requiredPeerStdDev) {
        const repeatedValue = sensorReadings[0];
        events.push(makeTelemetryFaultEvent(
          shipment,
          'SENSOR_STUCK',
          run,
          sensorId,
          `${sensorId} repeated ${repeatedValue.toFixed(2)}°C for ${run.length} consecutive samples; its temporal standard deviation was ${sensorStdDev.toFixed(3)}°C versus ${peerStdDev.toFixed(3)}°C for the peer-sensor median.`
        ));
      }
    }
  }

  const gpsDropoutRuns = consecutiveRuns(samples, (sample) => !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude));
  for (const run of gpsDropoutRuns.filter((items) => items.length >= MIN_OUTAGE_RUN_SAMPLES)) {
    events.push(makeTelemetryFaultEvent(shipment, 'GPS_DROPOUT', run, null, `GPS coordinates were missing for ${run.length} consecutive samples while telemetry continued.`));
  }
  return events;
}

function consecutiveRuns(samples, isAffected) {
  const runs = [];
  let currentRun = [];
  for (const sample of samples) {
    if (isAffected(sample)) currentRun.push(sample);
    else if (currentRun.length) {
      runs.push(currentRun);
      currentRun = [];
    }
  }
  if (currentRun.length) runs.push(currentRun);
  return runs;
}

function findStuckRuns(samples, sensorId) {
  const runs = [];
  let currentRun = [];
  const saveRun = () => {
    if (currentRun.length >= MIN_STUCK_RUN_SAMPLES) runs.push(currentRun);
    currentRun = [];
  };

  for (const sample of samples) {
    const value = sample.temperaturesC[sensorId];
    if (!Number.isFinite(value)) {
      saveRun();
      continue;
    }
    const firstValue = currentRun[0]?.temperaturesC[sensorId];
    if (currentRun.length && value !== firstValue) saveRun();
    currentRun.push(sample);
  }
  saveRun();
  return runs;
}

function makeTelemetryFaultEvent(shipment, type, run, sensorId, detail) {
  const startHour = run[0].elapsedHours;
  const endHour = run.at(-1).elapsedHours;
  const syntheticMatch = shipment.truth?.eventType === type.toLowerCase()
    && (!sensorId || shipment.truth?.sensor === sensorId);
  return {
    eventId: `${shipment.id}-${type}-${sensorId ?? 'fleet'}-${Math.round(startHour * 100)}`,
    shipmentId: shipment.id,
    type,
    startHour: Number(startHour.toFixed(2)),
    endHour: Number(endHour.toFixed(2)),
    severity: type === 'SENSOR_STUCK' ? 'MEDIUM' : 'LOW',
    confidence: type === 'SENSOR_STUCK' ? 0.72 : 0.68,
    affectedSensors: sensorId ? [sensorId] : [],
    evidence: [detail],
    groundTruthType: syntheticMatch ? 'SYNTHETIC_EVENT' : 'MODEL_ESTIMATE'
  };
}

function makeEvent(shipment, type, start, end, maxTemperature, duration, evidence) {
  const product = getProduct(shipment.productId);
  const excess = maxTemperature - product.referenceTemperatureC;
  const severity = excess >= 10 || duration >= 4 ? 'CRITICAL' : excess >= 5 || duration >= 1.5 ? 'HIGH' : 'MEDIUM';
  return {
    eventId: `${shipment.id}-${type}-${Math.round(start * 100)}`,
    shipmentId: shipment.id,
    type,
    startHour: Number(start.toFixed(2)),
    endHour: Number(end.toFixed(2)),
    severity,
    confidence: Number(clamp(0.58 + excess / 24 + Math.min(duration, 6) / 30, 0.55, 0.96).toFixed(2)),
    affectedSensors: SENSOR_IDS,
    evidence: [`Multi-sensor median reached ${maxTemperature.toFixed(1)}°C; configured reference is ${product.referenceTemperatureC}°C.`, `Warm interval persisted for approximately ${duration.toFixed(1)} hours.`, evidence],
    groundTruthType: 'MODEL_ESTIMATE'
  };
}

export function calculateQualityState(shipment) {
  const product = getProduct(shipment.productId);
  const samples = aggregateSamples(shipment);
  const physicalAgeHours = Math.max(0, samples.at(-1).elapsedHours - samples[0].elapsedHours);
  const eqAge = equivalentAge(samples, product);
  const qualityDebt = Math.max(0, eqAge - physicalAgeHours);
  const rsl = Math.max(0, product.nominalShelfLifeHours - eqAge);
  const rng = seededRandom(shipment.scenario.seed ^ 0xA53C9E1D);
  const monteCarlo = [];
  for (let draw = 0; draw < 240; draw += 1) {
    const energy = product.activationEnergyJMol * (0.88 + rng() * 0.24);
    const sampledAge = equivalentAge(samples, product, energy, () => logisticNoise(rng, 0.13));
    const shelfLife = product.nominalShelfLifeHours * (0.96 + rng() * 0.08);
    monteCarlo.push(Math.max(0, shelfLife - sampledAge));
  }
  const rslP10 = percentile(monteCarlo, 0.1);
  const rslP50 = percentile(monteCarlo, 0.5);
  const rslP90 = percentile(monteCarlo, 0.9);
  const baselines = baselinePredictions(samples, product, physicalAgeHours, rsl);
  const etaHours = shipment.etaHours;
  const arrivalMarginHours = rslP50 - etaHours;
  const riskBand = arrivalMarginHours <= 0 ? 'HIGH' : arrivalMarginHours <= 18 ? 'ELEVATED' : arrivalMarginHours <= 48 ? 'WATCH' : 'LOW';
  return {
    shipmentId: shipment.id,
    timestamp: samples.at(-1).timestampUtc,
    rsl_p10_hours: Number(rslP10.toFixed(1)),
    rsl_p50_hours: Number(rslP50.toFixed(1)),
    rsl_p90_hours: Number(rslP90.toFixed(1)),
    intervalWidthHours: Number((rslP90 - rslP10).toFixed(1)),
    confidenceClassification: rslP90 - rslP10 <= 14 ? 'HIGH' : rslP90 - rslP10 <= 30 ? 'MODERATE' : 'LOW',
    qualityDebtHours: Number(qualityDebt.toFixed(1)),
    equivalentAgeHours: Number(eqAge.toFixed(1)),
    physicalAgeHours: Number(physicalAgeHours.toFixed(1)),
    currentDegradationRate: Number(arrheniusRate(samples.at(-1).aggregateTemperatureC, product).toFixed(2)),
    spoilage_risk_before_destination: null,
    riskBand,
    arrivalMarginHours: Number(arrivalMarginHours.toFixed(1)),
    etaHours: Number(etaHours.toFixed(1)),
    coldChainEvent: shipment.events.some((event) => ['DOOR_OPEN', 'COOLING_FAILURE', 'HOT_HANDOFF', 'UNKNOWN_EXCURSION', 'DELAY'].includes(event.type)),
    eventProbability: null,
    sensorTrust: shipment.sensorTrust.score,
    sensorFlags: shipment.sensorTrust.flags,
    routeStage: shipment.currentStage,
    groundTruthType: shipment.groundTruthType === 'UNKNOWN' ? 'UNKNOWN' : 'PHYSICS_SIMULATED',
    modelVersion: MODEL_VERSION,
    baselines,
    safetyStatus: 'NOT_DETERMINED',
    allowedActions: [],
    modelNote: 'The interval samples illustrative kinetic parameters and sensor noise. It is not calibrated coverage.'
  };
}

function reason(action, reasons) {
  return { action, reasonCodes: reasons };
}

export function recommendActions(shipment, qualityState) {
  const scenario = shipment.scenario;
  const events = shipment.events;
  const hasThermalEvent = events.some((event) => ['DOOR_OPEN', 'HOT_HANDOFF', 'COOLING_FAILURE', 'UNKNOWN_EXCURSION', 'DELAY'].includes(event.type));
  const serious = qualityState.arrivalMarginHours <= 0 || events.some((event) => event.severity === 'CRITICAL');
  const watch = qualityState.arrivalMarginHours <= 24 || hasThermalEvent;
  const common = [];
  if (qualityState.sensorTrust < 65) common.push('VERIFY_SENSOR_HEALTH');
  if (hasThermalEvent) common.push('THERMAL_EVENT_DETECTED');
  if (qualityState.arrivalMarginHours <= 24) common.push('LOW_ARRIVAL_MARGIN');
  const entries = [
    { ...reason('INSPECT', [...common, 'HUMAN_REVIEW_REQUIRED']), score: serious ? 99 : watch ? 89 : qualityState.sensorTrust < 65 ? 94 : 38, cost: scenario.inspectionCostQar, savedHours: 0, requiresSafetyClearance: false },
    { ...reason('HOLD', [...common, serious ? 'CRITICAL_ARRIVAL_MARGIN' : 'PRECAUTIONARY_HOLD']), score: serious ? 95 : watch ? 58 : 18, cost: 0, savedHours: 0, requiresSafetyClearance: false },
    { ...reason('PRIORITISE_UNLOADING', [...common, 'REDUCE_HANDOFF_DWELL']), score: watch ? 92 : 52, cost: 0, savedHours: Math.min(1.5, scenario.etaHours * 0.12), requiresSafetyClearance: false },
    { ...reason('ADJUST_COOLING', [...common, 'RESTORE_CONFIGURED_SETPOINT']), score: hasThermalEvent ? 88 : 54, cost: 0, savedHours: 0, requiresSafetyClearance: false },
    { ...reason('EXPEDITE', [...common, 'SHORTEN_REMAINING_TRANSIT']), score: watch ? 82 : 44, cost: scenario.expeditionCostQar, savedHours: Math.min(3, scenario.etaHours * 0.45), requiresSafetyClearance: false },
    { ...reason('REROUTE', [...common, 'COMPARE_ROUTE_OPTIONS']), score: watch ? 73 : 33, cost: scenario.rerouteCostQar, savedHours: Math.min(1.5, scenario.etaHours * 0.2), requiresSafetyClearance: false },
    { ...reason('NO_ACTION', ['NO_URGENT_QUALITY_SIGNAL']), score: serious || watch ? 8 : 84, cost: 0, savedHours: 0, requiresSafetyClearance: false },
    { ...reason('REDIRECT_SURPLUS', ['SAFETY_CLEARANCE_REQUIRED']), score: 76, cost: 0, savedHours: 0, requiresSafetyClearance: true },
    { ...reason('PRIORITISE_INVENTORY', ['SAFETY_CLEARANCE_REQUIRED']), score: 68, cost: 0, savedHours: 0, requiresSafetyClearance: true }
  ];
  const candidates = entries.map((item) => ({
    action: item.action,
    score: Math.round(item.score),
    expectedCostQar: Number(item.cost.toFixed(0)),
    expectedLossQar: null,
    estimatedRiskReduction: null,
    simulatedQualityHoursPreserved: Number(item.savedHours.toFixed(1)),
    eligibility: item.requiresSafetyClearance && qualityState.safetyStatus !== 'CLEARED_BY_AUTHORIZED_OPERATOR' ? 'BLOCKED_SAFETY_CLEARANCE' : 'ELIGIBLE',
    reasonCodes: item.reasonCodes,
    provenance: 'DEMO_INPUT'
  }));
  candidates.sort((a, b) => b.score - a.score || a.action.localeCompare(b.action));
  qualityState.allowedActions = candidates.filter((candidate) => candidate.eligibility === 'ELIGIBLE').map((candidate) => candidate.action);
  return candidates;
}

export function calculateComparison(rawInput = {}) {
  const input = normalizeSimulationInput(rawInput);
  const base = simulateShipment({ ...input, shipmentId: `${input.shipmentId}-BASE`, eventType: input.eventType });
  const savedHours = Math.min(3, base.etaHours * 0.45);
  const intervention = { ...base, id: `${base.id}-EXPEDITE`, etaHours: Math.max(0.25, base.etaHours - savedHours) };
  intervention.qualityState = calculateQualityState(intervention);
  const baselineArrivalRsl = Math.max(0, base.qualityState.rsl_p50_hours - base.etaHours);
  const interventionArrivalRsl = Math.max(0, intervention.qualityState.rsl_p50_hours - intervention.etaHours);
  const simulatedRslPreserved = Number(Math.max(0, interventionArrivalRsl - baselineArrivalRsl).toFixed(1));
  return {
    provenance: 'SIMULATED · DEMO_INPUT',
    assumption: 'Future handling stays at the configured reference temperature. The comparison is a scenario calculation, not a measured saving.',
    normal: {
      etaHours: base.etaHours,
      arrivalRslHours: Number(baselineArrivalRsl.toFixed(1)),
      arrivalMarginP10Hours: Number((base.qualityState.rsl_p10_hours - base.etaHours).toFixed(1)),
      currentRslHours: base.qualityState.rsl_p50_hours
    },
    intervention: {
      action: 'EXPEDITE',
      etaHours: intervention.etaHours,
      arrivalRslHours: Number(interventionArrivalRsl.toFixed(1)),
      arrivalMarginP10Hours: Number((intervention.qualityState.rsl_p10_hours - intervention.etaHours).toFixed(1)),
      currentRslHours: intervention.qualityState.rsl_p50_hours,
      costQar: input.expeditionCostQar
    },
    estimatedQualityHoursPreserved: simulatedRslPreserved,
    optimizer: base.actions
  };
}

export function shipmentSummary(shipment) {
  const { id, productId, productName, currentStage, etaHours, status, source, groundTruthType, qualityState, sensorTrust, events, recommendation, truth, scenario } = shipment;
  const latest = shipment.samples?.at(-1);
  const currentTemperatures = Object.values(latest?.temperaturesC ?? {}).filter(Number.isFinite);
  const currentTemperatureC = median(currentTemperatures);
  const mapEvent = events.find((event) => Number.isFinite(event.startHour) && event.startHour <= (shipment.elapsedHours ?? 0)) ?? null;
  const coordinateSample = source === 'USER_SUPPLIED'
    ? [...(shipment.samples ?? [])].reverse().find((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude))
    : null;
  return {
    id, productId, productName, currentStage, etaHours, elapsedHours: shipment.elapsedHours,
    status, source, groundTruthType, qualityState, sensorTrust,
    eventCount: events.length, mapEvent,
    currentTemperatureC: currentTemperatureC === null ? null : Number(currentTemperatureC.toFixed(1)),
    mapCoordinate: coordinateSample ? {
      latitude: coordinateSample.latitude,
      longitude: coordinateSample.longitude,
      timestampUtc: coordinateSample.timestampUtc
    } : null,
    recommendation: recommendation?.action ?? 'INSPECT', injectedEvent: truth?.eventType ?? null,
    batchValueQar: scenario?.batchValueQar ?? null
  };
}

export function normalizeEventName(eventType) {
  return String(eventType ?? '').toUpperCase();
}

export { SENSOR_IDS, SENSOR_LABELS, EVENT_TYPES, arrheniusRate, equivalentAge, getProduct };
