import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticDemoPack } from '../src/evaluation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'public', 'synthetic-demo-pack.json');
const dataset = generateSyntheticDemoPack();
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

const sampleCount = dataset.records.reduce((total, record) => total + record.observations.length, 0);
console.log(`Wrote ${dataset.records.length} synthetic shipments and ${sampleCount} sensor time windows to ${outputPath}`);
