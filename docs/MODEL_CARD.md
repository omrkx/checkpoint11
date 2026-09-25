# Model card: ColdChain Guardian

**Implementation:** ccg-demo-physics-0.3.1. Local zero-dependency Node.js 20+ HTTP JSON service with a responsive vanilla JavaScript dashboard plus an optional Python/Pydantic real-data adapter layer. The synthetic demo, bundled public-data view, deterministic benchmark, and local advisor work without a live API or external service.

## Intended use

Demonstrate a cold-chain quality-monitoring workflow: summarize a temperature trace, estimate equivalent-age RSL under configured assumptions, flag rule-based temperature events and heuristic sensor concerns, rank constrained operator actions, and explain the result using local Markdown evidence. Treat the app as a prototype for human review, not a live operational decision system.

## Non-intended use

The app is not a food-safety test, pathogen detector, regulatory compliance engine, expiry-date authority, or automated disposition system. Do not use its output alone to release, sell, donate, redistribute, or consume a lot. No live-operation validation has been performed.

> **The product model estimates an illustrative quality-age proxy and remaining shelf life under configured assumptions. It does not independently certify that food is safe for consumption.**

## Products and configured targets

Two profiles are implemented. Every parameter below is DEMO_INPUT, illustrative, and unvalidated:

| Product profile | Reference temperature | Activation energy | Nominal life | Implemented target |
|---|---:|---:|---:|---|
| Fresh strawberries | 2°C | 58,000 J/mol | 168 h | Equivalent-age proxy |
| Pasteurised skim milk | 4°C | 69,000 J/mol | 144 h | Equivalent-age proxy; no CFU endpoint configured |

The app does not implement a milk microbial-count model or a validated strawberry quality endpoint. Other products are unsupported.

## Implemented quality calculation

For each time point, the engine takes the median of available sensor temperatures and integrates a relative Arrhenius rate over successive intervals. The rate is clamped to 0.02–25. Equivalent age is the integrated product age in reference-temperature hours. Quality Debt is the nonnegative difference between equivalent age and physical elapsed age. RSL is the configured nominal life minus equivalent age, floored at zero.

The simulator produces four synthetic sensor traces at 15-minute intervals. The model can also calculate from user-supplied JSON observations; it does not turn those observations into ground-truth quality labels.

Uncertainty uses 240 seeded Monte Carlo draws varying activation energy by ±12%, nominal life by ±4%, and illustrative sensor noise. The app reports p10/p50/p90. These are assumption ranges, not calibrated prediction intervals. The interval-width confidence class is heuristic.

The arrival margin is p50 RSL minus ETA and drives a rule-based risk band. It is not a spoilage probability. Spoilage-risk and event-probability fields are null.

## Baselines and learning status

- **Static expiry:** configured nominal life minus elapsed age; ignores temperature history.
- **Temperature threshold:** configured reference-temperature rule/event flag; no RSL estimate.
- **Degree-hours:** an illustrative temperature-excess calculation using a fixed 0.8 coefficient.
- **Physics only:** active Arrhenius equivalent-age model with demo parameters.
- **ML only:** inactive. Measured mango and raw-milk quality tables are now available through Python adapters, but no product-specific RSL target has been aligned, trained, and evaluated.
- **Physics + ML residual:** currently returns the physics estimate unchanged; no residual model is fitted.

No learned product-quality/RSL model, product-specific training pipeline, empirical model selection, or fitted product correction is included.

The app also includes a separate deterministic logistic-regression benchmark for the bundled public strawberry data. It predicts that dataset release's rule-derived severe temperature-state label within 120 minutes, using only the nine current sensor readings and complete-shipment holdouts. It is a learned classifier for a weak temperature-risk label, not an RSL or spoilage model. Its result is shown in the lower public-benchmark section of the Evaluation Lab; the Field data view displays the strawberry traces and compact samples from four other sources. Those other sources are visible evidence, not inputs to the RSL model. See `docs/DATA_CARD.md` and `docs/EVALUATION.md` for the data and limits.

## Event and sensor methods

Anomaly detection uses threshold rules and coalesces adjacent warm samples. The configured event threshold is the product reference plus 2.5°C; cross-sensor agreement and event duration heuristically distinguish short door-opening patterns, longer cooling failures, and unknown excursions. Injected scenario truth is available only because the simulator created the event.

Sensor trust uses heuristics for missing readings, flat channels while peer temperatures vary, warming divergence from peers, and cross-sensor spread. A flag is suspicion, not proof of a broken sensor or a corrected measurement.

## Decision and advisor layers

The action scorer applies fixed deterministic rules and demo inputs. When safety status is NOT_DETERMINED, it blocks REDIRECT_SURPLUS and PRIORITISE_INVENTORY; other allowed candidates remain workflow suggestions, not authoritative handling instructions. Displayed action costs and quality hours preserved are assumptions or simulation outputs.

The offline advisor retrieves from six local Markdown evidence entries using token-frequency ranking and produces a deterministic explanation. An optional OpenAI-compatible advisor is enabled only when endpoint and API key environment variables are present. Its response must have a bounded JSON response shape, repeat the deterministic recommendation, and require human inspection. Basic phrase and number checks reject certain unsupported safety, spoilage, performance, or invented-number claims; these filters are limited and are not a safety control. Invalid output falls back to the deterministic advisor. The advisor cannot change the RSL or clear safety status.

## Data and provenance

The Python data layer includes measured mango air-cargo telemetry and physical quality attributes, bulk raw-milk tank temperatures and laboratory measurements, public US strawberry shipment temperatures, commercial apple cold-room data, and retail produce-case aggregates. Only the strawberry source is currently used by the browser benchmark. None is a Qatar/GCC field-validation set, none supplies pathogen clearance, and none currently calibrates the dashboard RSL. Seeded Qatar/GCC shipments and simulator traces remain synthetic. JSON observations ingested through the API are kept in memory for the server session and carry USER_SUPPLIED source and UNKNOWN ground-truth provenance.

## Evaluation and metrics

The app has two separate evaluation paths:

- A synthetic event check generates 24 complete traces: eight scenario types (one normal and seven injected event types) across three descriptive route profiles. It matches detected events against injected event type and time, and reports event-level precision/recall/F1, false alerts, matched detection delay, and descriptive profile summaries. This is a simulator code-path check.
- A public strawberry benchmark trains a small logistic classifier in each fold, holding out one complete shipment ID at a time. The Evaluation Lab shows pooled classifier F1, recall, and Brier score, 4°C-rule F1, and per-shipment F1/false-negative counts. The API and CLI artifacts also include precision and accuracy against the source release's weak future R2 label. Six groups and overlapping windows limit inference.

RSL MAE/RMSE, measured spoilage metrics, quality-failure lead time, and interval coverage remain unavailable until one product's sensor history is aligned to a defined remaining-life or failure-time endpoint and evaluated on held-out groups. The newly ingested quality measurements are inputs for that next modeling phase; their presence alone does not produce those metrics. The public benchmark's scores do not fill those gaps. See `docs/EVALUATION.md` for commands, outputs, and limits.

## Limitations and out-of-distribution cases

Unknown product or parameters, missing or conflicting sensors, irregular intervals, unobserved product hot spots, inaccurate shipment age/ETA, different packaging or varieties, new facilities/routes, and environmental conditions outside the simulator are unsupported or out of distribution. Synthetic simulator performance does not establish field performance. No food-safety decision can be inferred from equivalent-age RSL.
