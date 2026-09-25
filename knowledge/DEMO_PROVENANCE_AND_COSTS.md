---
document_id: model-limitations
title: Provenance and demo costs
scope: Interpretation
authority: MODEL_CARD; DEMO_ONLY
created_date: 2026-09-25
real_or_demo: SYNTHETIC_AND_DEMO_INPUT
source_basis: src/store.mjs, src/engine.mjs, src/catalog.mjs, and src/evaluation.mjs
---

# Provenance and demo assumptions

## Synthetic route and event provenance

Seeded shipments and Simulation Lab traces are generated deterministically. The Hamad Port–Doha distribution-centre route is a schematic demo corridor, not live positioning or evidence about actual local operations. Temperatures, coordinates, stages, ambient profile, delays, event timing, sensor faults, and simulator event truth are synthetic.

Generated records carry PHYSICS_SIMULATED or SYNTHETIC_EVENT provenance. JSON observations submitted by a user are marked USER_SUPPLIED with groundTruthType UNKNOWN, retained in memory only for that server session. Model estimates calculated from uploaded observations are still estimates; input values do not become verified quality labels.

## Cost and comparison inputs

Current seeded defaults include QAR 42,000 batch value, QAR 180 inspection cost, QAR 950 reroute cost, and QAR 520 expedition cost. They are DEMO_INPUT assumptions. The displayed expedite comparison shortens simulated ETA and assumes future handling stays at the configured reference temperature. Its quality-hours difference is not a realized saving.

## Evidence catalog date

The evidence list's 2026-09-25 date identifies the seeded demo documents. It is not an official procedure's effective date. All six Markdown evidence files are local explanatory notes and must not be treated as approved SOPs, company policy, regulations, or external source validation.

## Required presentation

Keep SIMULATED, DEMO_INPUT, and UNKNOWN close to the associated records and outputs. Do not present demo costs as market quotes, synthetic routes as actual routes, detector checks as field metrics, or model-derived RSL as an observed measurement.
