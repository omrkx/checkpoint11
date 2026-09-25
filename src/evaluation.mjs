import { simulateShipment } from './engine.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINES = [
  { id: 'B0', name: 'Static expiry', method: 'Nominal shelf life minus elapsed time.', readiness: 'Implemented concept · telemetry ignored' },
  { id: 'B1', name: 'Temperature threshold', method: 'Flags readings above the product reference by a fixed margin.', readiness: 'Implemented as event detector' },
  { id: 'B2', name: 'Degree-hours', method: 'Accumulates temperature excess above the configured reference.', readiness: 'Comparison feature pending labelled data' },
  { id: 'B3', name: 'Physics only', method: 'Arrhenius equivalent-age calculation from the temperature history.', readiness: 'Active · illustrative parameters' },
  { id: 'B4', name: 'ML only', method: 'Supervised RSL regressor trained against product quality outcomes.', readiness: 'Inactive · measured sources require product-specific alignment and training' },
  { id: 'B5', name: 'Physics + ML residual', method: 'Physics RSL plus a learned residual correction.', readiness: 'Physics fallback · correction is not trained or calibrated' }
];

const EVENT_TYPE_COMPATIBILITY = {
  hot_handoff: ['HOT_HANDOFF', 'DOOR_OPEN', 'COOLING_FAILURE', 'UNKNOWN_EXCURSION']
};

function compatibleEventType(injectedType, detectedType) {
  const detected = String(detectedType ?? '').toUpperCase();
  const compatible = EVENT_TYPE_COMPATIBILITY[injectedType] ?? [String(injectedType ?? '').toUpperCase()];
  return compatible.includes(detected);
}

function intervalOverlapHours(truth, detected) {
  const truthStart = Number(truth.startHour);
  const truthEnd = Number(truth.endHour);
  const detectedStart = Number(detected.startHour);
  const detectedEnd = Number(detected.endHour);
  if (![truthStart, truthEnd, detectedStart, detectedEnd].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(truthEnd, detectedEnd) - Math.max(truthStart, detectedStart));
}

function matchInjectedEvents(truthEvents, detectedEvents) {
  const candidates = [];
  for (const [truthIndex, truth] of truthEvents.entries()) {
    for (const [detectedIndex, detected] of detectedEvents.entries()) {
      if (!compatibleEventType(truth.eventType, detected.type)) continue;
      const overlapHours = intervalOverlapHours(truth, detected);
      if (overlapHours <= 0) continue;
      if (truth.sensor && detected.affectedSensors?.length && !detected.affectedSensors.includes(truth.sensor)) continue;
      candidates.push({ truthIndex, detectedIndex, overlapHours });
    }
  }

  // Prefer the largest temporal overlap and match each truth/detection at most once.
  candidates.sort((a, b) => b.overlapHours - a.overlapHours || a.truthIndex - b.truthIndex || a.detectedIndex - b.detectedIndex);
  const usedTruth = new Set();
  const usedDetections = new Set();
  const matches = [];
  for (const candidate of candidates) {
    if (usedTruth.has(candidate.truthIndex) || usedDetections.has(candidate.detectedIndex)) continue;
    usedTruth.add(candidate.truthIndex);
    usedDetections.add(candidate.detectedIndex);
    matches.push(candidate);
  }
  return {
    matches,
    unmatchedTruthIndexes: truthEvents.map((_, index) => index).filter((index) => !usedTruth.has(index)),
    unmatchedDetectionIndexes: detectedEvents.map((_, index) => index).filter((index) => !usedDetections.has(index))
  };
}

function summarizeEventRecords(records) {
  const truePositives = records.reduce((sum, row) => sum + row.truePositiveEventCount, 0);
  const falsePositives = records.reduce((sum, row) => sum + row.falsePositiveEventCount, 0);
  const falseNegatives = records.reduce((sum, row) => sum + row.falseNegativeEventCount, 0);
  const truthCount = truePositives + falseNegatives;
  const predictionCount = truePositives + falsePositives;
  const precision = predictionCount ? truePositives / predictionCount : null;
  const recall = truthCount ? truePositives / truthCount : null;
  const f1Denominator = 2 * truePositives + falsePositives + falseNegatives;
  const delays = records.flatMap((row) => row.matchedEventDetails.map((match) => match.detectionDelayHours));
  const normalRows = records.filter((row) => row.injectedEvent === 'none');
  const normalFalseAlerts = normalRows.reduce((sum, row) => sum + row.falsePositiveEventCount, 0);
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: precision === null ? null : Number(precision.toFixed(3)),
    recall: recall === null ? null : Number(recall.toFixed(3)),
    f1: f1Denominator ? Number((2 * truePositives / f1Denominator).toFixed(3)) : null,
    falseAlertsPerShipment: Number((falsePositives / Math.max(records.length, 1)).toFixed(2)),
    falseAlertsPerNormalShipment: Number((normalFalseAlerts / Math.max(normalRows.length, 1)).toFixed(2)),
    medianDetectionDelayHours: delays.length ? Number(median(delays).toFixed(2)) : null,
    truthCount,
    predictionCount,
    normalScenarioCount: normalRows.length
  };
}

export function getEvaluationSummary() {
  return {
    provenance: 'REAL SENSOR + QUALITY SOURCES AVAILABLE · RSL MODEL NOT TRAINED',
    datasetReadiness: [
      { name: 'Strawberry shipment telemetry', type: 'OBSERVED TELEMETRY · rule-derived target', state: '14,398 windows · 6 US shipments', usableFor: 'Temperature patterns and weak-label early-warning benchmark; not spoilage validation' },
      { name: 'Mango air-cargo shipment', type: 'OBSERVED TELEMETRY + QUALITY', state: '41,418 sensor observations · 7,393 quality measurements', usableFor: 'Python adapter ready; one real Thailand–France route; not trained into app RSL' },
      { name: 'Bulk raw-milk tank', type: 'OBSERVED TELEMETRY + LAB', state: '186,629 sensor observations · 321 lab measurements', usableFor: 'Python adapter ready; not a pasteurised-milk distribution RSL model' },
      { name: 'Commercial apple cold room', type: 'OBSERVED TELEMETRY', state: '1,950,535 air/surface observations', usableFor: 'Storage, humidity, and condensation features; no quality endpoint' },
      { name: 'Retail produce display cases', type: 'OBSERVED AGGREGATES', state: '224 case-position records', usableFor: 'Retail-stage priors; no timestamp or product outcome' },
      { name: 'GCC/Qatar demo traces', type: 'SYNTHETIC', state: 'Available in app', usableFor: 'Rule/event pipeline demonstration only' }
    ],
    baselineComparison: BASELINES.map((baseline) => ({
      ...baseline,
      rslMaeHours: null,
      rslRmseHours: null,
      eventRecall: null,
      falseAlertsPerShipment: null,
      medianWarningLeadHours: null,
      intervalCoverage90: null,
      metricsLabel: 'No empirical score'
    })),
    unavailableMetrics: {
      rsl: 'Measured mango and milk quality tables are available, but no product RSL endpoint has been aligned, trained, or evaluated.',
      spoilage: 'No calibrated spoilage probability is available.',
      warningLead: 'No operational quality-failure event time has been defined and evaluated.',
      intervalCoverage: 'Uncertainty intervals are not calibrated against labelled outcomes.'
    },
    splitMethod: 'The public strawberry benchmark holds out complete shipment IDs. The external mango, milk, apple, and retail adapters are verified ingestion sources but are not part of the current RSL evaluation.',
    lastRun: null
  };
}

function buildSyntheticScenarioCases() {
  const types = [
    ['normal-port', 'none'],
    ['port-door', 'door_open'],
    ['port-handoff', 'hot_handoff'],
    ['truck-cooling', 'cooling_failure'],
    ['truck-drift', 'sensor_drift'],
    ['dc-stuck', 'sensor_stuck'],
    ['dc-dropout', 'sensor_dropout'],
    ['dc-gps', 'gps_dropout']
  ];
  const profiles = ['port-route', 'truck-route', 'dc-route'];
  const scenarioDurationHours = 10;
  const cases = [];
  for (const [index, [label, eventType]] of types.entries()) {
    for (let profile = 0; profile < profiles.length; profile += 1) {
      const startHour = 4 + profile * 0.5;
      const configuredDurationHours = eventType === 'cooling_failure' ? 3.5 : 1.25;
      const persistentSensorFault = ['sensor_drift', 'sensor_stuck'].includes(eventType);
      const truth = eventType === 'none' ? null : {
        eventType,
        startHour,
        // Drift and stuck-sensor faults remain present after injection stops, so their
        // synthetic truth window extends through the end of the generated trace.
        endHour: persistentSensorFault ? scenarioDurationHours : startHour + configuredDurationHours,
        severity: 0.78,
        sensor: ['sensor_drift', 'sensor_stuck', 'sensor_dropout'].includes(eventType) ? 'rear' : null
      };
      const scenarioInput = {
        shipmentId: `EV-${label.toUpperCase()}-${profile + 1}`,
        productId: index % 2 ? 'milk' : 'strawberry',
        eventType,
        eventOnsetHours: truth?.startHour ?? 4,
        eventDurationHours: truth ? configuredDurationHours : 1,
        selectedSensor: truth?.sensor ?? 'rear',
        severity: truth?.severity ?? 0,
        elapsedHours: scenarioDurationHours,
        etaHours: 5,
        seed: 71000 + index * 101 + profile,
        batchValueQar: 40000
      };
      cases.push({ label, eventType, routeProfile: profiles[profile], truth, scenarioInput });
    }
  }
  return { cases, profiles, scenarioDurationHours };
}

export function generateSyntheticDemoPack() {
  const { cases, profiles, scenarioDurationHours } = buildSyntheticScenarioCases();
  return {
    datasetId: 'CCG-SYNTHETIC-DEMO-24-V1',
    schemaVersion: '1.0.0',
    provenance: 'SYNTHETIC GENERATED DATA · NOT OBSERVED SHIPMENTS',
    intendedUse: 'Demonstrate the app data shape, injected sensor events, and rule-based event output.',
    limitations: [
      'Every temperature, humidity, location, timestamp, event label, and model output in this file is generated by the same deterministic demo simulator.',
      'The injected event is generator ground truth for a code-path demonstration, not a measured food-quality or food-safety outcome.',
      'The route-group names and Doha-like coordinates are schematic synthetic values, not evidence of real Qatar route operations.',
      'The included RSL, Quality Debt, sensor-trust, status, and recommendation values use illustrative model inputs and are not validated predictions.',
      'Do not use this pack to train or report real-world accuracy, spoilage, safety, saved food, or commercial economics.'
    ],
    generation: {
      generator: 'ColdChain Guardian deterministic scenario engine',
      scenarioCount: cases.length,
      normalScenarioCount: cases.filter((scenario) => scenario.eventType === 'none').length,
      injectedEventCount: cases.filter((scenario) => scenario.eventType !== 'none').length,
      routeGroupLabels: profiles,
      elapsedHours: scenarioDurationHours,
      sampleCadenceMinutes: 15,
      sensorChannels: ['front', 'centre', 'rear', 'door'],
      modelVersion: 'ccg-demo-physics-0.3.1'
    },
    records: cases.map(({ label, eventType, routeProfile, truth, scenarioInput }) => {
      const shipment = simulateShipment(scenarioInput);
      const quality = shipment.qualityState;
      return {
        shipmentId: shipment.id,
        scenarioLabel: label,
        routeGroup: routeProfile,
        product: { id: shipment.productId, name: shipment.productName },
        provenance: 'SYNTHETIC_GENERATED',
        groundTruthType: 'SYNTHETIC_SCENARIO_INPUT',
        injectedTruth: truth,
        scenarioInputs: scenarioInput,
        observations: shipment.samples,
        generatedOutput: {
          detectedEvents: shipment.events.map(({ eventId, type, startHour, endHour, severity, confidence, affectedSensors, groundTruthType }) => ({ eventId, type, startHour, endHour, severity, confidence, affectedSensors, groundTruthType })),
          status: shipment.status,
          sensorTrustScore: shipment.sensorTrust.score,
          recommendedAction: shipment.recommendation?.action ?? 'INSPECT',
          qualityEstimate: {
            groundTruthType: 'PHYSICS_SIMULATED',
            rslP10Hours: quality.rsl_p10_hours,
            rslP50Hours: quality.rsl_p50_hours,
            rslP90Hours: quality.rsl_p90_hours,
            qualityDebtHours: quality.qualityDebtHours,
            p50ArrivalMarginHours: quality.arrivalMarginHours,
            safetyStatus: quality.safetyStatus
          }
        },
        injectedEventType: eventType
      };
    })
  };
}

export function runSyntheticEvaluation() {
  const { cases, profiles } = buildSyntheticScenarioCases();
  const records = [];
  for (const { routeProfile, eventType, truth, scenarioInput } of cases) {
    const shipment = simulateShipment(scenarioInput);
    const truthEvents = truth ? [truth] : [];
    const matching = matchInjectedEvents(truthEvents, shipment.events);
    const matchedEventDetails = matching.matches.map(({ truthIndex, detectedIndex, overlapHours }) => {
      const expected = truthEvents[truthIndex];
      const detection = shipment.events[detectedIndex];
      return {
        truthType: expected.eventType,
        detectedEventId: detection.eventId,
        detectedType: detection.type,
        overlapHours: Number(overlapHours.toFixed(2)),
        truthStartHour: expected.startHour,
        detectedStartHour: detection.startHour,
        detectionDelayHours: Number(Math.max(0, detection.startHour - expected.startHour).toFixed(2))
      };
    });
    const matchedDetectionIndexes = new Set(matching.matches.map((item) => item.detectedIndex));
    const matchedStartHours = matchedEventDetails.map((item) => item.detectedStartHour).filter(Number.isFinite);
    records.push({
      groupId: shipment.id,
      routeProfile,
      injectedEvent: eventType,
      detected: matching.matches.length > 0,
      classifiedAsExpected: matching.matches.length > 0,
      eventCount: shipment.events.length,
      truePositiveEventCount: matching.matches.length,
      falsePositiveEventCount: matching.unmatchedDetectionIndexes.length,
      falseNegativeEventCount: matching.unmatchedTruthIndexes.length,
      detectedTypes: shipment.events.map((event) => event.type),
      detectedEvents: shipment.events,
      matchedEventIds: [...matchedDetectionIndexes].map((eventIndex) => shipment.events[eventIndex].eventId),
      falsePositiveEventIds: matching.unmatchedDetectionIndexes.map((eventIndex) => shipment.events[eventIndex].eventId),
      matchedEventDetails,
      truthStartHour: truth?.startHour ?? null,
      detectedStartHour: matchedStartHours.length ? Math.min(...matchedStartHours) : null,
      truthEventCount: truthEvents.length,
      unmatchedTruthCount: matching.unmatchedTruthIndexes.length,
      unmatchedDetectionCount: matching.unmatchedDetectionIndexes.length
    });
  }

  const eventRows = records.filter((record) => record.injectedEvent !== 'none');
  const eventTotals = summarizeEventRecords(records);
  const foldMetrics = profiles.map((routeProfile) => {
    const rows = records.filter((record) => record.routeProfile === routeProfile);
    const eventCounts = summarizeEventRecords(rows);
    return {
      routeProfile,
      shipmentCount: rows.length,
      injectedEventCount: eventCounts.truthCount,
      truePositiveEvents: eventCounts.truePositives,
      falsePositiveEvents: eventCounts.falsePositives,
      falseNegativeEvents: eventCounts.falseNegatives,
      eventPrecision: eventCounts.precision,
      eventRecall: eventCounts.recall,
      eventF1: eventCounts.f1,
      classificationMatch: eventCounts.recall,
      falseAlertsPerShipment: eventCounts.falseAlertsPerShipment,
      falseAlertsPerNormalShipment: eventCounts.falseAlertsPerNormalShipment,
      medianDetectionDelayHours: eventCounts.medianDetectionDelayHours
    };
  });

  return {
    provenance: 'SYNTHETIC SCENARIO CHECK · NOT FIELD VALIDATION',
    splitMethod: 'Complete scenario records remain intact; the rule detector is not fitted. No individual sensor rows are treated as independent held-out shipments.',
    routeProfiles: profiles,
    shipmentCount: records.length,
    injectedEventCount: eventRows.length,
    normalScenarioCount: eventTotals.normalScenarioCount,
    foldMetrics,
    metrics: {
      eventTruePositives: eventTotals.truePositives,
      eventFalsePositives: eventTotals.falsePositives,
      eventFalseNegatives: eventTotals.falseNegatives,
      eventPrecision: eventTotals.precision,
      eventRecall: eventTotals.recall,
      eventF1: eventTotals.f1,
      eventClassificationMatch: eventTotals.recall,
      falseAlertsPerShipment: eventTotals.falseAlertsPerShipment,
      falseAlertsPerNormalShipment: eventTotals.falseAlertsPerNormalShipment,
      medianDetectionDelayHours: eventTotals.medianDetectionDelayHours,
      rslMaeHours: null,
      rslRmseHours: null,
      spoilageMetrics: null,
      intervalCoverage90: null,
      qualityFailureLeadTimeHours: null
    },
    baselines: BASELINES.map((baseline) => ({ ...baseline, rslMaeHours: null, rslRmseHours: null, eventRecall: null, falseAlertsPerShipment: null, medianWarningLeadHours: null, intervalCoverage90: null, metricsLabel: 'No empirical score' })),
    rawEventRows: records,
    limitations: [
      'Event precision, recall, F1, false alerts, and detection delay are scored only against synthetic injected truth using one-to-one compatible-type and positive-time-overlap matching.',
      'The scenario generator and event detector are deterministic demo components; this check does not establish field performance.',
      'No RSL, spoilage, calibration, or food-safety metrics can be calculated without measured quality endpoints.',
      'Detection delay is measured from the matched synthetic event interval start; it is not shelf-life warning lead time.'
    ]
  };
}

export async function writeEvaluationArtifacts(result) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'evaluation');
  await mkdir(root, { recursive: true });
  const safeMetrics = {
    provenance: result.provenance,
    splitMethod: result.splitMethod,
    routeProfiles: result.routeProfiles,
    shipmentCount: result.shipmentCount,
    injectedEventCount: result.injectedEventCount,
    normalScenarioCount: result.normalScenarioCount,
    metrics: result.metrics,
    foldMetrics: result.foldMetrics,
    limitations: result.limitations
  };
  await writeFile(path.join(root, 'metrics.json'), `${JSON.stringify(safeMetrics, null, 2)}\n`, 'utf8');
  await writeCsv(path.join(root, 'fold_metrics.csv'), ['route_profile', 'shipment_count', 'injected_event_count', 'true_positive_events', 'false_positive_events', 'false_negative_events', 'event_precision', 'event_recall', 'event_f1', 'classification_match', 'false_alerts_per_shipment', 'false_alerts_per_normal_shipment', 'median_detection_delay_hours'], result.foldMetrics.map((row) => [row.routeProfile, row.shipmentCount, row.injectedEventCount, row.truePositiveEvents, row.falsePositiveEvents, row.falseNegativeEvents, row.eventPrecision, row.eventRecall, row.eventF1, row.classificationMatch, row.falseAlertsPerShipment, row.falseAlertsPerNormalShipment, row.medianDetectionDelayHours]));
  await writeCsv(path.join(root, 'predictions.csv'), ['shipment_id', 'route_profile', 'injected_event', 'event_detected', 'classification_match', 'true_positive_events', 'false_positive_events', 'false_negative_events', 'matched_event_ids', 'false_positive_event_ids', 'detection_delay_hours', 'detected_types', 'truth_start_hour', 'matched_detection_start_hour'], result.rawEventRows.map((row) => [row.groupId, row.routeProfile, row.injectedEvent, row.detected, row.classifiedAsExpected, row.truePositiveEventCount, row.falsePositiveEventCount, row.falseNegativeEventCount, row.matchedEventIds.join('|'), row.falsePositiveEventIds.join('|'), row.matchedEventDetails.map((match) => match.detectionDelayHours).join('|'), row.detectedTypes.join('|'), row.truthStartHour, row.detectedStartHour]));
  const events = result.rawEventRows.flatMap((row) => row.detectedEvents.map((event) => [row.groupId, row.routeProfile, event.eventId, event.type, event.startHour, event.endHour, event.severity, event.confidence, event.groundTruthType]));
  await writeCsv(path.join(root, 'events.csv'), ['shipment_id', 'route_profile', 'event_id', 'event_type', 'start_hour', 'end_hour', 'severity', 'confidence', 'ground_truth_type'], events);
  return root;
}

async function writeCsv(filename, headers, rows) {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
  await writeFile(filename, `${content}\n`, 'utf8');
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
