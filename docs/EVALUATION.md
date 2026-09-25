# Evaluation protocol and implemented checks

ColdChain Guardian has two different evaluation paths. Keep their targets and claims separate.

## Public strawberry early-warning benchmark

The Evaluation Lab can run `POST /api/public-benchmark/evaluation/run`, or the command below:

```powershell
node scripts/evaluate_public_strawberry.mjs
```

This benchmark predicts whether a record will enter the public dataset release's rule-derived severe temperature state R2 within 120 minutes. It does **not** predict measured spoilage, remaining shelf life, pathogen presence, or food safety.

### Protocol

- Use the six shipment IDs as the outer groups. Hold out one complete shipment, fit on the other five, then repeat for each of the six shipments.
- Use only the nine raw temperatures available at the prediction timestamp. Fit missing-value imputation and scaling on the training groups for each fold.
- Exclude non-trainable rows and rows without a binary future target. Do not split adjacent windows across train and test.
- Compare deterministic L2 logistic regression with a transparent rule that predicts positive when any current sensor exceeds 4°C.
- Report pooled row-level precision, recall, F1, accuracy, and Brier score, alongside per-shipment-fold metrics. A Brier score is calculated against the weak future R2 label and is not spoilage-risk calibration.

The classifier is deliberately small and reproducible. Its scores describe out-of-shipment prediction of a source-derived label only. Six shipments, overlapping windows, class prevalence, and rule-based targets limit interpretation. No result establishes transfer to Qatar/GCC routes or fruit quality.

### Recorded benchmark result

On the bundled release, the evaluator scored 12,974 eligible windows from six shipment holdouts. The learned classifier reached precision 0.932, recall 0.899, F1 0.9152, accuracy 0.8633, and Brier score 0.0767. The 4°C rule reached precision 0.9995, recall 0.9738, F1 0.9865, accuracy 0.9781, and Brier score 0.0219. The simple rule outperformed logistic regression on every pooled metric reported here. This is evidence about agreement with the dataset's rule-derived future R2 label only; it does not show that either method predicts spoilage or remaining shelf life. Re-run the command below to recreate the audit files.

The Evaluation Lab displays pooled classifier F1, recall, and Brier score; 4°C-rule F1; and per-shipment F1 and classifier false-negative counts. The `POST /api/public-benchmark/evaluation/run` response also contains pooled precision and accuracy, per-shipment fold metrics, exclusions, model inputs, and limitations, but omits the row-level predictions. The CLI output writes the full metrics JSON, fold CSV, and row-level prediction CSV into `artifacts/public-benchmark/` for review. The Field data view is for source-temperature and weak-label exploration; it is separate from the synthetic Qatar/GCC shipment views.

### Run the evaluation script

```powershell
node scripts/evaluate_public_strawberry.mjs
```

Expected outputs:

- `artifacts/public-benchmark/metrics.json`
- `artifacts/public-benchmark/fold_metrics.csv`
- `artifacts/public-benchmark/predictions.csv`

## Synthetic route-event check

Run `node scripts/evaluate.mjs`, use **Run synthetic event check** in the Evaluation Lab, or call `POST /api/evaluation/run`. The evaluator generates 24 complete traces: eight scenario types (a normal trace and seven injected event types) across three descriptive route profiles.

It matches detected events one-to-one against injected synthetic truth when types are compatible and intervals overlap by a positive duration; where the truth names a sensor and the detection reports affected sensors, those must agree as well. It reports event-level true positives, false positives, false negatives, precision, recall, F1, false alerts per shipment, false alerts per normal shipment, and detection delay for matched events. Detection delay is calculated from the matched detected-event interval start minus the injected event start, with negative values clipped to zero. For the injected drift and stuck-sensor cases, synthetic truth extends to the end of the trace because the generated fault remains present. A route-profile summary is descriptive grouping, not a held-out validation fold. The Evaluation Lab surfaces recall, type-and-time classification match, and normal-trace false alerts; the API and artifacts contain event counts and the additional precision/recall/F1 fields. These are simulator code-path metrics only, not online latency, field performance, or warning lead time to a quality failure.

The command writes synthetic artifacts under `artifacts/evaluation/`. The artifacts directory is ignored by git by default; run the command to recreate them.

## Food-quality and food-safety metrics

Measured mango mass/color/pH/soluble-solids records and bulk raw-milk laboratory records are now included through the Python adapter layer. They are not yet aligned to a product-specific remaining-life target, trained into the browser model, or evaluated on held-out groups. No observed pathogen endpoint or Qatar/GCC customer record is included. Therefore, the app still does not report empirical RSL MAE/RMSE, spoilage AUPRC or calibration, calibrated p10-p90 interval coverage, measured quality-failure lead time, or realized food loss avoided.

When suitable data become available:

- Split by whole shipment and batch; for laboratory measurements use the strongest independent unit, such as bottle or treatment batch.
- Build features only from information available up to the prediction time, and fit preprocessing within each training fold.
- For measured RSL, report MAE/RMSE in hours and errors by product and group.
- For probability ranges, report interval coverage and width on held-out measured outcomes.
- For a defined measured spoilage endpoint, report precision/recall, AUPRC, Brier score, and calibration.
- For operational incidents, group alert windows into events and report event recall, false alerts per shipment, and measured warning lead time.
- Keep model quality estimates separate from any food-safety decision. Use applicable policy and an authorised human review.

## Existing baselines

| Baseline | Status | Available evidence |
|---|---|---|
| Static expiry | Implemented concept; ignores telemetry | Synthetic/demo only |
| Temperature threshold | Used by rule detector and public-data comparator | Synthetic event check; public derived-label comparator |
| Degree-hours | Illustrative calculation | Demo inputs only |
| Arrhenius physics | Active for simulator RSL and Quality Debt | Illustrative parameters; not calibrated |
| ML-only product RSL | Inactive | Measured sources ingested; target alignment, training, and grouped evaluation remain |
| Physics plus learned residual | Physics fallback | Residual correction inactive and uncalibrated |
| Logistic early-warning classifier | Active only in public strawberry evaluation | Predicts weak future temperature-state label, not spoilage |
