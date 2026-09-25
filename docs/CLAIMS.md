# Claims register

**Core statement:** The product model estimates an illustrative quality-age proxy and remaining shelf life under configured demonstration assumptions. It does not independently certify that food is safe for consumption.

This register applies to the local prototype: a zero-dependency Node.js 20+ HTTP JSON service and responsive browser dashboard. The Field data library displays bounded samples from five public sources, and keeps all observed records distinct from synthetic Qatar/GCC demo scenarios.

## Observed public telemetry and derived target

- The strawberry portion of Field data contains observed temperatures from six US shipments: 14,398 W60 snapshots sampled at 10-minute intervals, with nine pallet-position probes per snapshot. The rolling windows overlap.
- The same page offers compact, bounded sample views from the mango air-cargo, Spanish farm milk-tank, commercial apple cold-storage, and retail produce-case datasets. Their source counts, licenses, sample rules, and limitations are shown with the data.
- The data release supplies an author-derived weak label for whether the shipment will enter a severe temperature state called R2 within 120 minutes.
- This target is not measured spoilage, laboratory microbial load, sensory quality, remaining shelf life, pathogen presence, or food safety.
- The public shipment-detail endpoint also exposes source-derived future target and risk metadata for inspection. Those fields are evaluation labels, not classifier inputs.
- The logistic classifier's leave-one-shipment-out scores measure prediction of that derived label only. Six shipment groups and overlapping windows do not establish broad generalization.
- Milk laboratory and mango physical/chemical measurements appear as separate public records. They are not joined to the displayed temperature samples. No ComBase records, customer data, or observed Qatar/GCC routes are included.

## Model-derived estimates

- The app calculates an Arrhenius equivalent-age estimate, Quality Debt, latest-state RSL p10/p50/p90, rule-based anomaly flags, heuristic sensor-trust scores, and action rankings from the input trace and configured demonstration parameters.
- The Simulation Lab attributes modeled warm-period equivalent-aging increments to route stages for the selected synthetic scenario. This diagnostic does not establish real Qatar/GCC stage-level causes, and its warm-period contributions do not necessarily sum to shipment-level net Quality Debt.
- The p10 arrival margin is the sampled lower-side remaining-life estimate minus ETA. It is a cautious planning comparison under illustrative assumptions, not calibrated interval coverage or spoilage probability.
- Product kinetics and nominal life are `DEMO_INPUT` and are not calibrated product specifications. The Monte Carlo range varies illustrative parameter and sensor-noise assumptions; it is not calibrated interval coverage.
- The arrival margin and status band are heuristic comparisons of the median RSL with entered ETA. Spoilage probability fields remain unavailable/null.
- Product ML-only RSL is inactive. The Field data page displays bounded examples of measured mango physical-quality and milk laboratory records, but they have not been aligned, trained, or calibrated into the dashboard's product RSL model. Physics plus ML residual therefore still uses the unchanged physics estimate; the strawberry benchmark does not validate that RSL estimate.
- The separate public-benchmark classifier predicts only its weak future R2 label. It does not alter the quality estimate.
- In the synthetic application, anomaly types and sensor faults come from rules and peer-sensor heuristics, not a trained field anomaly model. The action scorer uses deterministic rules and demo costs, not validated economics.

## Synthetic scenarios and assumptions

- The six seeded records (QA-HEALTHY-001, QA-STRAW-001, QA-MILK-001, QA-SENSOR-FAULT-001, QA-DROPOUT-001, QA-CRITICAL-001) are generated deterministic scenarios.
- Simulation Lab routes, temperatures, schematic coordinates, stages, sensor faults, injected truth, RSL, Quality Debt, actions, and comparisons are simulated. Hamad Port to Doha is not live fleet positioning or a claim about actual commercial movements.
- Synthetic event metrics evaluate configured simulator cases only. They are not field performance, event prevalence, or product-quality accuracy.
- Estimated quality hours preserved, value retained, avoided loss, and action impact are simulation outputs under assumptions, not realized savings.
- Default batch value QAR 42,000, inspection cost QAR 180, reroute cost QAR 950, and expedition cost QAR 520 are `DEMO_INPUT`, not company quotes or market estimates.

## Not validated

- No Qatar/GCC operational dataset, measured product-quality/RSL label set, pathogen/safety data, or approved local operating procedure is present.
- There are no empirical RSL errors, calibrated food-spoilage probabilities, calibrated p10-p90 coverage, measured quality-failure lead times, realized food-loss reductions, or safety outcomes to claim.
- No result establishes pathogen absence, regulatory compliance, saleability, donation eligibility, or fitness for consumption. Those decisions require applicable requirements and qualified human review.
- User-uploaded JSON telemetry is held in server memory, assigned `groundTruthType: UNKNOWN`, and not independently verified.

## Approved demo wording

“The Field data page shows bounded samples from five public sources, including observed temperatures from six US strawberry shipments, apple cold-room tests, a mango route, a farm milk tank, and retail display cases. Measured lab/fruit values remain separate from sensor traces. The classifier comparison predicts only the strawberry release's rule-derived temperature-risk label. Separately, in the synthetic Qatar scenario, the configured physics model estimates illustrative Quality Debt and remaining shelf life. No path determines whether food is safe or validates Qatar food-spoilage prediction.”

Avoid “prevents spoilage,” “saves X tonnes,” “predicts food safety,” “X% accurate at predicting spoilage,” or “validated in Qatar” unless new, independently reviewable evidence supports that claim.

## Sustainability and SDG wording

- The intended direct alignment is UN SDG 12, Target 12.3, which calls for reducing food losses along production and supply chains.
- Goals 2 and 13 are possible co-benefits only if subsequent evidence shows more food remains available and avoidable losses or associated emissions fall.
- The prototype has not measured food saved, access improved, or greenhouse gas emissions avoided; describe these as intended contributions rather than impact results.
