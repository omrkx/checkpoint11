import { runSyntheticEvaluation, writeEvaluationArtifacts } from '../src/evaluation.mjs';

const report = runSyntheticEvaluation();
const folder = await writeEvaluationArtifacts(report);
console.log(`Synthetic event check written to ${folder}`);
console.log(`Event recall: ${(report.metrics.eventRecall * 100).toFixed(0)}% across ${report.injectedEventCount} generated event traces.`);
console.log('Measured mango and milk quality tables are ingested, but RSL metrics remain unavailable until a product-specific endpoint is aligned, trained, and evaluated.');
