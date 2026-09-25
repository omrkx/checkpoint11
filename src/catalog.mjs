export const MODEL_VERSION = 'ccg-demo-physics-0.3.1';

const commonLimitations = [
  'Illustrative model parameters; external measured sources have not been calibrated into this dashboard model.',
  'The Python data layer contains real telemetry and some quality measurements, but no trained product RSL model is active.',
  'A quality estimate is not a food-safety determination.'
];

export const PRODUCTS = [
  {
    id: 'strawberry',
    name: 'Fresh strawberries',
    shortName: 'Strawberries',
    icon: 'berry',
    category: 'Fresh produce',
    referenceTemperatureC: 2,
    activationEnergyJMol: 58000,
    nominalShelfLifeHours: 168,
    parameterSource: 'DEMO_INPUT · illustrative',
    qualityEndpoint: 'Equivalent-age proxy against configured nominal life',
    supportedSensors: ['temperature', 'humidity', 'location', 'sensor position'],
    validationDataset: 'Six observed US shipments · temperature weak labels only; no measured strawberry RSL',
    groundTruthType: 'PHYSICS_SIMULATED',
    limitations: commonLimitations
  },
  {
    id: 'milk',
    name: 'Pasteurised skim milk',
    shortName: 'Skim milk',
    icon: 'milk',
    category: 'Dairy',
    referenceTemperatureC: 4,
    activationEnergyJMol: 69000,
    nominalShelfLifeHours: 144,
    parameterSource: 'DEMO_INPUT · illustrative',
    qualityEndpoint: 'Equivalent-age proxy · no CFU threshold configured',
    supportedSensors: ['temperature', 'humidity', 'location', 'sensor position'],
    validationDataset: 'Raw-milk tank + lab source available in Python adapter · not pasteurised-milk RSL calibration',
    groundTruthType: 'PHYSICS_SIMULATED',
    limitations: commonLimitations
  }
];

export const PRODUCT_MAP = new Map(PRODUCTS.map((product) => [product.id, product]));

export const ROUTE_STAGES = [
  { id: 'PORT', label: 'Hamad Port', short: 'Port', hour: 0 },
  { id: 'PORT_HANDOFF', label: 'Port handoff', short: 'Handoff', hour: 2 },
  { id: 'CUSTOMS_OR_STAGING', label: 'Customs / staging', short: 'Staging', hour: 4 },
  { id: 'REEFER_TRUCK', label: 'Reefer truck', short: 'Transit', hour: 6 },
  { id: 'DISTRIBUTION_CENTRE_RECEIVING', label: 'Doha distribution centre', short: 'DC receiving', hour: 10 },
  { id: 'COLD_STORAGE', label: 'Cold storage', short: 'Cold store', hour: 12 },
  { id: 'RETAIL_HANDOFF', label: 'Retail handoff', short: 'Retail', hour: 16 }
];

export const EVIDENCE = [
  { id: 'demo-product-profile', title: 'Milk product profile', scope: 'Product configuration', authority: 'DEMO_INPUT', effectiveDate: '2026-09-25', file: 'MILK_PROFILE_DEMO.md' },
  { id: 'strawberry-product-profile', title: 'Strawberry product profile', scope: 'Product configuration', authority: 'DEMO_INPUT', effectiveDate: '2026-09-25', file: 'STRAWBERRY_PROFILE_DEMO.md' },
  { id: 'temperature-excursion-sop', title: 'Temperature excursion response', scope: 'Operator response', authority: 'DEMO_GUIDANCE', effectiveDate: '2026-09-25', file: 'HANDOFF_EXCURSION_DEMO.md' },
  { id: 'sensor-fault-sop', title: 'Sensor disagreement and fault checks', scope: 'Telemetry quality', authority: 'DEMO_GUIDANCE', effectiveDate: '2026-09-25', file: 'SENSOR_TRUST_DEMO.md' },
  { id: 'redistribution-policy', title: 'Quality prediction and safety clearance', scope: 'Food safety boundary', authority: 'DEMO_POLICY · not regulatory advice', effectiveDate: '2026-09-25', file: 'QUALITY_SAFETY_BOUNDARY_DEMO.md' },
  { id: 'model-limitations', title: 'Provenance and demo costs', scope: 'Interpretation', authority: 'MODEL_CARD', effectiveDate: '2026-09-25', file: 'DEMO_PROVENANCE_AND_COSTS.md' }
];

export function getProduct(id) {
  return PRODUCT_MAP.get(id) ?? null;
}

export function getStage(hour) {
  const eligible = ROUTE_STAGES.filter((stage) => stage.hour <= hour);
  return eligible.at(-1) ?? ROUTE_STAGES[0];
}
