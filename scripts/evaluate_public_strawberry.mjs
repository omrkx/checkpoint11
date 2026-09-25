import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPublicBenchmarkEvaluation } from '../src/public-benchmark.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'artifacts', 'public-benchmark');
const result = await runPublicBenchmarkEvaluation();
await mkdir(outputDirectory, { recursive: true });

const { predictions, ...metrics } = result;
await writeFile(path.join(outputDirectory, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');

const foldRows = result.perShipmentMetrics.map((fold) => [
  fold.shipmentId,
  fold.trainingRowCount,
  fold.evaluatedRowCount,
  fold.positiveTargetCount,
  fold.logisticRegression.precision,
  fold.logisticRegression.recall,
  fold.logisticRegression.f1,
  fold.logisticRegression.accuracy,
  fold.logisticRegression.brierScore,
  fold.currentMaxThreshold.precision,
  fold.currentMaxThreshold.recall,
  fold.currentMaxThreshold.f1,
  fold.currentMaxThreshold.accuracy,
  fold.currentMaxThreshold.brierScore
]);
await writeCsv(path.join(outputDirectory, 'fold_metrics.csv'), [
  'held_out_shipment', 'training_rows', 'evaluated_rows', 'positive_targets',
  'logistic_precision', 'logistic_recall', 'logistic_f1', 'logistic_accuracy', 'logistic_brier',
  'threshold_precision', 'threshold_recall', 'threshold_f1', 'threshold_accuracy', 'threshold_brier'
], foldRows);

await writeCsv(path.join(outputDirectory, 'predictions.csv'), [
  'shipment_id', 'timestamp', 'actual_future_r2', 'logistic_probability', 'logistic_prediction',
  'threshold_prediction', 'max_current_temperature_c'
], predictions.map((row) => [
  row.shipmentId, row.timestamp, row.actual, row.logisticProbability, row.logisticPrediction,
  row.thresholdPrediction, row.thresholdMaximumTemperatureC
]));

console.log(`Wrote leave-one-shipment-out metrics for ${result.shipmentCount} shipments and ${predictions.length.toLocaleString('en')} labelled rows to ${outputDirectory}`);
console.log(`Logistic F1: ${result.metrics.logisticRegression.f1}; 4°C threshold F1: ${result.metrics.currentMaxThreshold.f1}`);
console.log('Targets are the release authors\' rule-derived future temperature-state labels, not measured spoilage.');

async function writeCsv(filename, headers, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  await writeFile(filename, `${content}\n`, 'utf8');
}
