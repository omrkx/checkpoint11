# Synthetic demo data

## Download

The Evaluation Lab offers a downloadable [`synthetic-demo-pack.json`](../public/synthetic-demo-pack.json). Regenerate the deterministic pack with:

```powershell
node scripts/generate_synthetic_demo_pack.mjs
```

## What is inside

The pack has 24 generated shipment traces: three generated scenario groups across eight cases (normal handling, door opening, hot handoff, cooling failure, sensor drift, sensor stuck, sensor dropout, and GPS dropout). Each trace contains ten hours of 15-minute observations from four simulated sensor positions, the event injected by the generator, the rule detector output, and the simulator's quality estimate.

The records are derived from the same deterministic scenario engine used by the demo and synthetic event check. This makes them reproducible and useful for explaining the app's data shape and exercising the display. The injected event is known because the generator created it; it is not a measured food-quality outcome.

## Provenance and limits

Every record is marked `SYNTHETIC_GENERATED`. Sensor readings, timestamps, humidity, schematic location coordinates, event truth, and model outputs are generated. Route-group labels are scenario categories, not observed routes. The quality estimate uses illustrative `DEMO_INPUT` parameters.

Use this pack for presentations, interface examples, and code-path demonstrations. Do not describe it as real Qatar/GCC logistics data, an independent model test, model training evidence, predicted spoilage, validated RSL, a food-safety assessment, or proof of food loss avoided. The synthetic generator and the event detector are components of the same demo, so their comparison is not independent field validation.

For the separate observed-data view and its weak-label limits, see [DATA_CARD.md](DATA_CARD.md) and [EVALUATION.md](EVALUATION.md).
