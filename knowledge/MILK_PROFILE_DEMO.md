---
document_id: demo-product-profile
title: Milk product profile
scope: Product configuration
authority: DEMO_INPUT; DEMO_ONLY
created_date: 2026-09-25
real_or_demo: DEMO
source_basis: src/catalog.mjs and deep-research-report-2.md; no original milk measurements supplied
---

# Pasteurised skim milk: configured demo profile

## Implemented configuration

The local prototype configures a 4°C reference temperature, 69,000 J/mol activation energy, and 144-hour nominal life. All three are illustrative DEMO_INPUT values. The implemented endpoint is an equivalent-age proxy; no CFU threshold or microbial-growth model is configured.

## Research context

The supplied research report describes a milk temperature-abuse experiment with bacterial-count and pH measurements. The original records are not in this workspace and the experiment was not reproduced or independently checked here. The app does not train on those measurements.

## Interpretation limit

The displayed milk RSL is the configured physics estimate, not a study result or validated commercial shelf life. A total-count or pH endpoint would not by itself establish pathogen status. This profile is not a storage rule, regulatory limit, or release procedure.
