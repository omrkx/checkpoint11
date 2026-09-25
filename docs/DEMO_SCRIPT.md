# Demo script (about four minutes)

## 0:00–0:25 · Overview and provenance

**Show:** Overview with the seeded fleet and schematic route badge.

**Say:** “A temperature threshold says a line was crossed. ColdChain Guardian adds a configured quality-age estimate, sensor checks, and a constrained action shortlist. The fleet and Hamad Port–Doha corridor on screen are synthetic demo scenarios, not real customer shipments or live positioning.”

## 0:25–1:15 · Inject a handoff event

**Show:** Open Simulation Lab, select strawberries or milk, choose Hot handoff, set the route stage and event duration, and run the scenario.

**Say:** “I’m injecting a generated hot handoff into four simulated sensor channels. The model integrates their temperature history using illustrative Arrhenius parameters. Quality Debt and RSL are model outputs; these are not laboratory measurements.”

Point out the trace, detected event, sensor trust, and RSL p10/p50/p90. “The range is generated from 240 Monte Carlo draws over illustrative parameters and sensor noise. It is not calibrated coverage. The arrival margin is an ETA comparison heuristic, not a spoilage probability.”

## 1:15–1:55 · Threshold comparison and sensor trust

**Show:** Compare the temperature-threshold flag with the physics estimate and baseline table. Point to the rule-based event panel.

**Say:** “The threshold rule detects a configured crossing but does not estimate RSL. The physics estimate accumulates equivalent age. We have now ingested measured mango and milk quality tables, but they are not yet aligned and trained into this dashboard model, so ML-only stays inactive and the hybrid still falls back to physics. Event grouping and sensor flags are heuristics, not trained classifications.”

## 1:55–2:45 · Explain and compare an intervention

**Show:** Open a shipment detail, ask Why did you alert?, then return to Simulation Lab and show the normal route versus expedite comparison.

**Say:** “The offline advisor searches local Markdown evidence and explains the deterministic result. These evidence notes are explicitly demo guidance, not approved operating procedures. The advisor cannot change RSL or safety status.”

Ask: “What if we expedite by three hours?”

**Say:** “The comparison shortens simulated ETA under the configured assumption that future handling stays at the reference temperature. The shown quality hours and QAR cost are scenario calculations using demo inputs, not observed savings.”

Point out that surplus redirection and inventory prioritization are blocked while safety remains NOT DETERMINED.

## 2:45–3:35 · Evaluation Lab

**Show:** In Evaluation Lab, download the 24-trace synthetic pack and run the synthetic event check. Point out that generated truth is known because the simulator injected it. Then open **Field data**, select a strawberry shipment, and show its observed temperature traces. In the measured-data library below, select Apple to compare observed cold-room air and fruit-surface temperatures, then Milk to show a real tank-day trace with separate lab records. If time allows, show that Mango is stage-specific and Retail has untimestamped case summaries rather than a time chart. Return to Evaluation Lab and run **Run public benchmark** in the lower section.

**Say:** “The synthetic check scores the event detector against generated truth, so it is a code-path check, not field validation. The Field data library lets us inspect five published sources: strawberry shipments, a mango air-cargo route, milk tank storage, apple cold-room tests, and retail case summaries. The plots show bounded samples of measured records. The milk and mango lab/fruit measurements remain separate from the displayed sensor traces because we have not validated a join. None trains the dashboard RSL model. The public benchmark holds out one whole strawberry shipment at a time and predicts the dataset release's rule-derived future R2 temperature-state label. That target is not spoilage or shelf life; product RSL accuracy and interval calibration remain unavailable.”

## 3:35–4:00 · Close

**Show:** Return to the fleet overview and stage summary.

**Close:** “The intended contribution is to UN SDG 12.3, reducing food loss along supply chains. This prototype has not measured food saved or emissions avoided. The next step for any real operational claim is authorized shipment data with product-specific quality labels and evaluation on held-out shipments. A quality estimate does not certify food safety.”

## Presenter guardrails

- Keep SIMULATED, DEMO_INPUT, and UNKNOWN provenance visible where applicable.
- If quoting synthetic evaluator output, identify it as a code-path check on generated traces, not field performance.
- If quoting public benchmark output, identify the target as the source release's weak, rule-derived future temperature-state label and mention that only six shipment groups are available.
- Do not call the interval calibrated or the arrival margin a probability.
- Do not present seeded cost assumptions, action rankings, or saved-quality estimates as actual economics.
- The seeded evidence catalog date is a documentation date, not an official SOP effective date.
