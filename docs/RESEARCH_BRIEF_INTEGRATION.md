# Research brief integration notes

This page records which useful recommendations from `deep-research-report-2.md` are visible in the app and what their limits are.

## Incorporated in the app

- **Handoff-focused what-if analysis:** Simulation Lab now attributes modeled extra equivalent-aging hours above the configured product reference to each route stage. The selected injected event is identified by its time and route stage. This helps a user see how a handoff scenario changes the temperature history and modeled quality estimate.
- **Lower-side arrival planning:** the shipment watchlist, quality passport, and scenario comparison show an illustrative p10 remaining-life scenario relative to the estimated arrival time. A negative margin means the estimated arrival occurs after that lower-side modeled remaining-life value.
- **Evidence authority in explanations:** matched local knowledge documents show their scope and authority beside their title so demo notes are easier to distinguish from approved operating procedures.
- **Route-stage clock alignment:** simulated route stages now use the same elapsed-trip clock as the selected event time. This keeps the stage name shown for an injected event consistent with the stage plotted for that time.
- **Existing safeguards retained:** provenance badges, sensor peer checks, explicit food-safety boundaries, action restrictions, and separate synthetic versus public weak-label evaluation remain in place.

## How to read the new stage view

The stage bars integrate the current demonstration's Arrhenius aging-rate estimate only for intervals above the configured product reference temperature. They use the median of the available pallet sensors for each sample interval and assign that interval to its recorded route stage.

This is **one synthetic scenario**, not a measurement of actual Qatar port or warehouse operations. The stage totals are warm-period contributions, while shipment-level Quality Debt is a net estimate relative to elapsed time and can also reflect periods below the configured reference. The two quantities therefore need not add up to the same number.

## Interpretation limits

- The p10-p90 range samples illustrative kinetic and sensor-noise assumptions. It has not been calibrated against held-out product-quality outcomes, so p10 is not a guaranteed lower bound or a validated 90% coverage interval.
- The p10 arrival margin is a planning comparison under the demo model. It is neither spoilage probability nor food-safety clearance.
- Advisor references are local demo knowledge notes and model documentation. Their labels show document scope and authority; they do not turn demo notes into approved SOPs.
- The five external data adapters remain an ingestion layer. Their records have not been aligned, trained, or calibrated into the dashboard RSL model. The bulk-milk source is raw farm-tank data, not a pasteurised-milk distribution experiment.
- The research brief's recommended pasteurised-milk temperature-abuse benchmark and USDA ComBase kinetics remain future evidence work. They should be added only with source-specific licenses, product endpoints, and provenance preserved.

## Next evidence steps

1. Acquire and review the pasteurised skim-milk temperature-abuse dataset and define its measured quality endpoint and time alignment.
2. Obtain appropriate USDA ComBase growth records for the product and organism context; fit or validate product-specific kinetic parameters rather than mixing unrelated food records.
3. Train and evaluate one product-specific model using complete batch or experiment groups as holdouts.
4. Calibrate prediction intervals and test action rules with qualified food-safety and Qatar/GCC operating partners before live use.
