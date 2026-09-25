---
document_id: temperature-excursion-sop
title: Temperature excursion response
scope: Operator response
authority: DEMO_GUIDANCE; DEMO_ONLY
created_date: 2026-09-25
real_or_demo: SYNTHETIC_SCENARIO_GUIDANCE
source_basis: Simulator and product design in src/engine.mjs, src/catalog.mjs, and deep-research-report-2.md
---

# Simulated handoff excursion

## Scope

The prototype can generate a temperature excursion during a hypothetical route stage such as port handoff, staging, truck transit, distribution-centre receiving, cold storage, or retail handoff. The route is schematic. A route label or real place name does not make generated telemetry real.

## Implemented interpretation

The simulator generates four sensor traces at 15-minute intervals. The rule detector groups adjacent intervals above the configured product reference plus 2.5°C. Cross-sensor agreement and event duration heuristically distinguish short door-opening patterns, longer cooling failures, and unknown excursions. Injected event type and timing are simulator truth; a detected event is a rule output.

Quality Debt and RSL are computed separately by the Arrhenius equivalent-age model using demo product parameters. Neither identifies a confirmed physical root cause nor establishes field impact. Normal-versus-expedite comparison is a simulated counterfactual that assumes future handling stays at the configured reference temperature.

## Action boundary

The deterministic action scorer can rank inspection, hold, cooling adjustment, unloading priority, expediting, rerouting, or no action under demo inputs. It is a prototype workflow suggestion, not an authorized handling instruction. Follow approved operator procedures and applicable requirements for actual product.
