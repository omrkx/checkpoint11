import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const TEMPERATURE_COUNT = 9;
const POSITIVE_THRESHOLD_C = 4;
const LOGISTIC_L2 = 0.01;
const LOGISTIC_MAX_ITERATIONS = 4000;
const LOGISTIC_TOLERANCE = 1e-7;
const FEATURE_COUNT = TEMPERATURE_COUNT;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = path.resolve(moduleDirectory, '..', 'data', 'public-strawberry', 'benchmark.json.gz');
let rowsPromise;

const LIMITATIONS = [
  'The target is the dataset author\'s rule-derived label for entering severe temperature-risk state R2 within 120 minutes; it is not an observed spoilage, microbial, sensory-quality, or remaining-shelf-life outcome.',
  'The label is weak supervision derived from temperature-state rules, so the scores measure agreement with that rule-derived target rather than independent food-quality validation.',
  'Only six shipment IDs are available. Leave-one-complete-shipment-out scores have high variance and do not establish performance on other shipments, routes, products, or operating conditions.',
  'These results are a small public-benchmark comparison, not a calibrated food-spoilage prediction or food-safety assessment.'
];

async function loadRows() {
  if (!rowsPromise) {
    rowsPromise = (async () => {
      const compressed = await readFile(datasetPath);
      const decoded = gunzipSync(compressed).toString('utf8');
      const parsed = JSON.parse(decoded);
      const sourceRows = Array.isArray(parsed) ? parsed : parsed?.rows;
      if (!Array.isArray(sourceRows)) {
        throw new TypeError('The public strawberry benchmark must contain a JSON array of rows.');
      }
      return sourceRows.map(normalizeRow);
    })();
  }
  return rowsPromise;
}

function normalizeRow(row) {
  const temperatures = Array.isArray(row?.temperaturesC) ? row.temperaturesC : [];
  return {
    shipmentId: typeof row?.shipmentId === 'string' ? row.shipmentId : String(row?.shipmentId ?? ''),
    timestamp: row?.timestamp ?? null,
    temperaturesC: Array.from({ length: TEMPERATURE_COUNT }, (_, index) => finiteNumber(temperatures[index])),
    trainable: row?.trainable === true,
    targetNext120: finiteNumber(row?.targetNext120),
    currentRiskLevel: finiteNumber(row?.currentRiskLevel),
    etaToR2Minutes: finiteNumber(row?.etaToR2Minutes)
  };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getEligibleRows(rows) {
  return rows.filter((row) => row.trainable && (row.targetNext120 === 0 || row.targetNext120 === 1));
}

function getDatasetCounts(rows) {
  const trainableRows = rows.filter((row) => row.trainable);
  const missingTargetRows = trainableRows.filter((row) => row.targetNext120 === null);
  const invalidTargetRows = trainableRows.filter((row) => row.targetNext120 !== null && row.targetNext120 !== 0 && row.targetNext120 !== 1);
  const eligibleRows = getEligibleRows(rows);
  return {
    rowCount: rows.length,
    shipmentCount: new Set(rows.map((row) => row.shipmentId).filter(Boolean)).size,
    trainableRowCount: trainableRows.length,
    eligibleRowCount: eligibleRows.length,
    excludedRowCount: rows.length - eligibleRows.length,
    excludedRows: {
      nonTrainable: rows.length - trainableRows.length,
      missingTargetAmongTrainable: missingTargetRows.length,
      nonBinaryTargetAmongTrainable: invalidTargetRows.length
    },
    positiveTargetCount: eligibleRows.filter((row) => row.targetNext120 === 1).length,
    negativeTargetCount: eligibleRows.filter((row) => row.targetNext120 === 0).length
  };
}

export async function getPublicBenchmarkSummary() {
  const rows = await loadRows();
  return {
    dataset: 'Public strawberry W60 benchmark',
    provenance: 'Bundled public benchmark; six shipment IDs.',
    target: {
      field: 'targetNext120',
      positiveClass: 'The dataset author\'s rule-derived label indicates entry into severe temperature-risk state R2 within the next 120 minutes.',
      negativeClass: 'The dataset author\'s rule-derived label indicates no entry into severe temperature-risk state R2 within the next 120 minutes.',
      outcomeType: 'Rule-derived future temperature-state label; not a spoilage or measured food-quality label.'
    },
    ...getDatasetCounts(rows),
    limitations: [...LIMITATIONS]
  };
}

export async function listPublicBenchmarkShipments() {
  const rows = await loadRows();
  const eligible = getEligibleRows(rows);
  const byShipment = new Map();
  for (const row of rows) {
    if (!row.shipmentId) continue;
    if (!byShipment.has(row.shipmentId)) byShipment.set(row.shipmentId, []);
    byShipment.get(row.shipmentId).push(row);
  }

  return [...byShipment.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([shipmentId, shipmentRows]) => {
    const eligibleRows = eligible.filter((row) => row.shipmentId === shipmentId);
    const timestamps = shipmentRows.map((row) => row.timestamp).filter((timestamp) => timestamp !== null);
    return {
      shipmentId,
      rowCount: shipmentRows.length,
      trainableRowCount: shipmentRows.filter((row) => row.trainable).length,
      eligibleRowCount: eligibleRows.length,
      positiveTargetCount: eligibleRows.filter((row) => row.targetNext120 === 1).length,
      negativeTargetCount: eligibleRows.filter((row) => row.targetNext120 === 0).length,
      startTimestamp: timestamps[0] ?? null,
      endTimestamp: timestamps.at(-1) ?? null
    };
  });
}

export async function getPublicBenchmarkShipment(id) {
  const rows = await loadRows();
  const shipmentId = String(id ?? '');
  const shipmentRows = rows.filter((row) => row.shipmentId === shipmentId);
  if (!shipmentRows.length) return null;
  return {
    shipmentId,
    rowCount: shipmentRows.length,
    rows: shipmentRows.map((row) => ({ ...row, temperaturesC: [...row.temperaturesC] }))
  };
}

export async function runPublicBenchmarkEvaluation() {
  const allRows = await loadRows();
  const eligibleRows = getEligibleRows(allRows);
  const shipmentIds = [...new Set(allRows.map((row) => row.shipmentId).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const rowIndexes = new Map(allRows.map((row, index) => [row, index]));
  const predictions = [];
  const foldMetrics = [];

  for (const heldOutShipmentId of shipmentIds) {
    const trainingRows = eligibleRows.filter((row) => row.shipmentId !== heldOutShipmentId);
    const heldOutRows = eligibleRows.filter((row) => row.shipmentId === heldOutShipmentId);
    const model = fitLogisticRegression(trainingRows);
    const foldPredictions = heldOutRows.map((row, index) => {
      const probability = predictProbability(model, row.temperaturesC);
      const maximumTemperature = maxObservedTemperature(row.temperaturesC);
      return {
        shipmentId: heldOutShipmentId,
        timestamp: row.timestamp,
        rowIndex: rowIndexes.get(row),
        actual: row.targetNext120,
        logisticProbability: probability,
        logisticPrediction: probability >= 0.5 ? 1 : 0,
        thresholdPrediction: maximumTemperature === null ? null : maximumTemperature > POSITIVE_THRESHOLD_C ? 1 : 0,
        thresholdMaximumTemperatureC: maximumTemperature
      };
    });
    predictions.push(...foldPredictions);
    foldMetrics.push({
      shipmentId: heldOutShipmentId,
      trainingShipmentIds: shipmentIds.filter((id) => id !== heldOutShipmentId),
      trainingRowCount: trainingRows.length,
      trainingPositiveCount: trainingRows.filter((row) => row.targetNext120 === 1).length,
      trainingModel: model.kind,
      evaluatedRowCount: foldPredictions.length,
      positiveTargetCount: foldPredictions.filter((row) => row.actual === 1).length,
      logisticRegression: calculateMetrics(foldPredictions, 'logisticPrediction', 'logisticProbability'),
      currentMaxThreshold: calculateMetrics(foldPredictions, 'thresholdPrediction', 'thresholdPrediction')
    });
  }

  return {
    provenance: 'Bundled public strawberry W60 benchmark.',
    target: 'Predict the dataset author\'s rule-derived future severe temperature-state label: entry into R2 within 120 minutes. This is not spoilage prediction.',
    splitMethod: 'Leave-one-complete-shipment-out cross-validation: each shipment ID is held out in turn, and all eligible rows from that shipment are evaluated together. No rows from a held-out shipment are used for fitting or scaling.',
    shipmentCount: shipmentIds.length,
    shipmentIds,
    eligibleRowCount: eligibleRows.length,
    excludedRows: getDatasetCounts(allRows).excludedRows,
    model: {
      name: 'Deterministic L2 logistic regression',
      inputs: Array.from({ length: TEMPERATURE_COUNT }, (_, index) => `temperaturesC[${index}]`),
      inputRule: 'Uses only the nine raw current temperature readings. Null readings are imputed from the corresponding training-fold sensor mean; scaling statistics are fit on training rows only. Future targets, current risk levels, ETA values, shipment IDs, and timestamps are not model inputs.',
      optimization: `Full-batch gradient descent, ${LOGISTIC_MAX_ITERATIONS} maximum iterations, L2 coefficient ${LOGISTIC_L2}; fixed initialization and no random sampling. If a training fold has fewer than two label classes, a Laplace-smoothed constant probability is used for that fold.`,
      decisionThreshold: 0.5
    },
    baseline: {
      name: `Current maximum temperature > ${POSITIVE_THRESHOLD_C} °C`,
      rule: 'Predict positive when at least one of the nine current sensor readings is above 4 °C; rows with all nine readings missing are unscored for this baseline.'
    },
    metrics: {
      logisticRegression: calculateMetrics(predictions, 'logisticPrediction', 'logisticProbability'),
      currentMaxThreshold: calculateMetrics(predictions, 'thresholdPrediction', 'thresholdPrediction')
    },
    perShipmentMetrics: foldMetrics,
    predictions,
    limitations: [...LIMITATIONS]
  };
}

function fitLogisticRegression(rows) {
  const labels = rows.map((row) => row.targetNext120);
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) {
    return {
      kind: 'laplace-smoothed constant fallback',
      probability: (positives + 1) / (labels.length + 2),
      means: Array(FEATURE_COUNT).fill(0),
      scales: Array(FEATURE_COUNT).fill(1),
      coefficients: Array(FEATURE_COUNT).fill(0),
      intercept: 0
    };
  }

  const observedByFeature = Array.from({ length: FEATURE_COUNT }, (_, featureIndex) => rows
    .map((row) => row.temperaturesC[featureIndex])
    .filter((value) => value !== null));
  const allObservedTemperatures = observedByFeature.flat();
  const fallbackMean = average(allObservedTemperatures) ?? 0;
  const means = observedByFeature.map((values) => average(values) ?? fallbackMean);
  const scales = observedByFeature.map((values) => {
    if (!values.length) return 1;
    const mean = average(values);
    const standardDeviation = Math.sqrt(average(values.map((value) => (value - mean) ** 2)) ?? 0);
    return standardDeviation > 1e-8 ? standardDeviation : 1;
  });
  const matrix = rows.map((row) => transformFeatures(row.temperaturesC, means, scales));
  const prevalence = (positives + 1) / (labels.length + 2);
  const coefficients = Array(FEATURE_COUNT).fill(0);
  let intercept = Math.log(prevalence / (1 - prevalence));
  const learningRate = 0.05;

  for (let iteration = 0; iteration < LOGISTIC_MAX_ITERATIONS; iteration += 1) {
    const coefficientGradient = Array(FEATURE_COUNT).fill(0);
    let interceptGradient = 0;
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      const error = sigmoid(dot(coefficients, matrix[rowIndex]) + intercept) - labels[rowIndex];
      interceptGradient += error / matrix.length;
      for (let featureIndex = 0; featureIndex < FEATURE_COUNT; featureIndex += 1) {
        coefficientGradient[featureIndex] += error * matrix[rowIndex][featureIndex] / matrix.length;
      }
    }
    for (let featureIndex = 0; featureIndex < FEATURE_COUNT; featureIndex += 1) {
      coefficientGradient[featureIndex] += LOGISTIC_L2 * coefficients[featureIndex];
    }
    const maxGradient = Math.max(Math.abs(interceptGradient), ...coefficientGradient.map(Math.abs));
    if (maxGradient < LOGISTIC_TOLERANCE) break;
    intercept -= learningRate * interceptGradient;
    for (let featureIndex = 0; featureIndex < FEATURE_COUNT; featureIndex += 1) {
      coefficients[featureIndex] -= learningRate * coefficientGradient[featureIndex];
    }
  }

  return { kind: 'logistic regression', probability: prevalence, means, scales, coefficients, intercept };
}

function predictProbability(model, temperatures) {
  if (model.kind === 'laplace-smoothed constant fallback') return model.probability;
  return sigmoid(dot(model.coefficients, transformFeatures(temperatures, model.means, model.scales)) + model.intercept);
}

function transformFeatures(temperatures, means, scales) {
  return Array.from({ length: FEATURE_COUNT }, (_, index) => {
    const value = temperatures[index] ?? means[index];
    return (value - means[index]) / scales[index];
  });
}

function maxObservedTemperature(temperatures) {
  const observed = temperatures.filter((value) => value !== null);
  return observed.length ? Math.max(...observed) : null;
}

function calculateMetrics(rows, predictionKey, probabilityKey) {
  const scoredRows = rows.filter((row) => row[predictionKey] === 0 || row[predictionKey] === 1);
  const positives = scoredRows.filter((row) => row.actual === 1).length;
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  let brierSum = 0;
  for (const row of scoredRows) {
    const prediction = row[predictionKey];
    if (prediction === 1 && row.actual === 1) truePositive += 1;
    else if (prediction === 1) falsePositive += 1;
    else if (row.actual === 1) falseNegative += 1;
    else trueNegative += 1;
    const probability = Math.min(1, Math.max(0, row[probabilityKey]));
    brierSum += (probability - row.actual) ** 2;
  }
  const precision = ratioOrZero(truePositive, truePositive + falsePositive);
  const recall = ratioOrZero(truePositive, positives);
  return {
    evaluatedRowCount: scoredRows.length,
    unscoredRowCount: rows.length - scoredRows.length,
    positiveTargetCount: positives,
    predictedPositiveCount: truePositive + falsePositive,
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision: rounded(precision),
    recall: rounded(recall),
    f1: rounded(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    accuracy: rounded(ratioOrZero(truePositive + trueNegative, scoredRows.length)),
    brierScore: scoredRows.length ? rounded(brierSum / scoredRows.length) : null,
    zeroDenominatorConvention: 'Precision, recall, F1, and accuracy are reported as 0 when their denominator is 0.'
  };
}

function dot(left, right) {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result += left[index] * right[index];
  return result;
}

function sigmoid(value) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function ratioOrZero(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function rounded(value) {
  return Number(value.toFixed(4));
}
