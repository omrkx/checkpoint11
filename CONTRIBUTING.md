# Contributing

ColdChain Guardian is an offline-capable Node.js app intended for reuse and
adaptation. Contributions should preserve data provenance and the boundary
between food-quality estimates and food-safety decisions.

## Run locally

Requirements: Node.js 20 or later. The app uses Node.js built-ins and does not
need an npm install.

```powershell
node server.mjs
```

Open `http://127.0.0.1:4173`.

## Working with data

- Keep synthetic, observed telemetry, laboratory outcomes, and derived labels
  visibly distinct.
- Never describe the strawberry benchmark's weak severe-temperature target as
  measured spoilage, food safety, or an observed microbial outcome.
- The bundled public benchmark is a separate weak-label task: it predicts the
  source release's rule-derived future R2 temperature state. It does not train
  or validate the synthetic app's product RSL estimate. Keep those results and
  the Qatar/GCC simulator visibly separate.
- Split model evaluation by complete shipment or batch. Do not place windows
  from one shipment in both training and test data.
- Cite external data and preserve its license and attribution separately from
  the app license. The bundled benchmark's source and scope are recorded in
  `data/public-strawberry/NOTICE.md` and `docs/DATA_CARD.md`.
- The public shipment-detail API exposes the source-derived target and current
  rule-state metadata for inspection. Never use those target/future fields as
  classifier inputs. The evaluation endpoint returns metrics and per-shipment
  summaries without row-level predictions; the CLI writes predictions to
  `artifacts/public-benchmark/` for audit.
- Regenerating the compact benchmark from the preserved workbook is optional
  and requires Python 3, pandas, and openpyxl. The running app remains
  Node.js-only and does not download the dataset at startup.
- Do not put customer credentials, sensor secrets, or private operational
  records into checked-in files.

## Changes and review

Keep the app runnable without hosted services. Describe added assumptions and
their provenance in the relevant model, data, and claims documents. A public
dataset or algorithm change should include its source, license, transformation,
and the evaluation split and target it supports.
