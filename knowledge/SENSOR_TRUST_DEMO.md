---
document_id: sensor-fault-sop
title: Sensor disagreement and fault checks
scope: Telemetry quality
authority: DEMO_GUIDANCE; DEMO_ONLY
created_date: 2026-09-25
real_or_demo: DEMO_HEURISTICS
source_basis: Heuristics implemented in src/engine.mjs; design context in deep-research-report-2.md
---

# Sensor disagreement and data quality

## Implemented checks

The prototype inspects recent readings (up to 12 per sensor) and flags patterns including missing readings, nearly flat channels that disagree with peers, warming divergence from peers, and cross-sensor spread. These checks produce heuristic trust scores and flags; they do not prove that a sensor is faulty or reconstruct true product temperature.

## Operator interpretation in the demo

- Inspect the displayed timestamp, sensor identity, readings, missingness, and peer channels together.
- Keep a flagged value visible; do not treat the trust score as a correction to the measurement.
- A shared warming pattern across sensors may indicate a different scenario from one isolated outlier, but the heuristic cannot establish physical cause.
- If readings are missing or conflicting, treat model outputs as low-evidence and request human review.

Sensor placement, calibration, thermal lag, packaging, local hot spots, timestamp errors, and correlated faults can all affect the signal. This is not an approved calibration, maintenance, inspection, or food-safety procedure.
