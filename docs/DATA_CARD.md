# Data card: ColdChain Guardian open-data integration

## Intended use

This data layer supplies measured temperature histories, humidity, handling-stage context, and selected laboratory or physical quality measurements for cold-chain model development. It supports anomaly detection, thermal-feature engineering, sensor robustness work, and—where measured quality outcomes are available—development of product-specific quality models.

It does **not** create food-safety clearance. Temperature telemetry alone is not a spoilage, pathogen, or remaining-shelf-life label. Product, route, facility, and batch groups must remain intact when splitting training and evaluation data.

## Source selection and ranking

A short Qatar Open Data search was performed first. The portal publishes [monthly Qatar temperature and relative-humidity statistics](https://www.data.gov.qa/explore/dataset/monthly-temperature-and-relative-humidity-statistics-qatar/), but no immediately usable public food-shipment telemetry paired with product-quality outcomes was found. That environmental table may help describe Qatar's ambient exposure; it is not cold-chain training truth. The implementation therefore pivoted to five measured global sources.

| Rank | Dataset | Strict utility rating | What is measured | Best model use | Key limitation |
|---:|---|---:|---|---|---|
| 1 | [Mango air-cargo supply chain, Thailand to France](https://doi.org/10.57745/F9UJGQ) | 9.5/10 | Product and air temperature, humidity, route stages, mass, color, pH, and soluble solids | Thermal-history-to-quality modeling and stage-aware validation | One shipment; CC BY-NC-SA 4.0 means commercial training needs permission |
| 2 | [Bulk Milk Tank Performance](https://doi.org/10.17632/2sw758pw38.2) | 9.0/10 | Tank surface/near-surface temperature plus laboratory bacteriology and composition | Dairy sensor modeling and date-level quality association | Farm tank storage, not pasteurized distribution; lab samples are not a pathogen-safety label |
| 3 | [Strawberry Cold-Chain Transportation](https://huggingface.co/datasets/NifferLi/Cold-Chain-Transportation-Strawberry) | 8.5/10 | Nine temperature positions across six real US shipments | Multi-sensor anomaly detection and shipment-held-out early warning | Future R2 target is rule-derived weak supervision, not measured spoilage/RSL |
| 4 | [Commercial Apple Cold Storage](https://doi.org/10.17632/h4sghvyjyt.2) | 8.0/10 | Air temperature, fruit-surface temperature, humidity, four tests, multiple bins | Condensation, spatial variation, missing-sensor, and storage-control features | No direct quality endpoint; one commercial facility and season |
| 5 | [Retail Produce Display Cases](https://doi.org/10.17632/vdt2n9sygc.1) | 6.5/10 | Temperature and moisture summaries by retailer, case, door type, and position | Retail-stage priors and cabinet-position stress scenarios | Aggregate rows have no timestamp or named product outcome; unsuitable for sequence training |

The associated strawberry sensor study is [Abdella, Brecht, and Uysal (2021)](https://arxiv.org/abs/2103.12895). The mango dataset's accompanying open-access data article is [Paviet-Salomon et al. (2025)](https://doi.org/10.1016/j.dib.2025.111803).

## Canonical contract

All source adapters yield the Pydantic `SensorObservation` model in `coldchain/data/schema.py`. Required provenance includes dataset, shipment or storage-group ID, sensor ID, product, measurement type, and an exact source-row locator. Temperature is normalized to Celsius and humidity to percent. Latitude and longitude remain null when absent.

`observed_at` is preserved from the source. It is timezone-aware when an epoch is available. It remains a naive source timestamp when the release does not establish a timezone, and it is null for the retail aggregate table. The adapters never create timestamps, RSL values, spoilage labels, or food-safety labels.

Measured product endpoints use the separate `QualityMeasurement` model. Keeping quality measurements separate prevents a laboratory value from being silently repeated onto every sensor row or treated as if it were measured continuously.

## Adapter inventory and verification

| Adapter | Local source | Validated sensor observations | Quality measurements | Important transform |
|---|---|---:|---:|---|
| `MangoAirCargoAdapter` | `data/external/mango-air-cargo/mango-air-cargo-complete.zip` | 41,418 | 7,393 | Uses route-stage files and excludes duplicate whole-route logger files; emits air and mango temperatures separately |
| `BulkMilkTankAdapter` | `data/external/bulk-milk-tank/` | 186,629 | 321 | Uses UTC epoch; skips the source's `-127` missing-value sentinel; preserves surface and near-surface channels |
| `StrawberryTransportAdapter` | `data/public-strawberry/benchmark.json.gz` | 68,706 | 0 | Expands each snapshot into up to nine positions; keeps R2 fields explicitly marked as weak labels |
| `AppleColdStorageAdapter` | `data/external/apple-cold-storage/TTH_ColdRoom_June19.zip` | 1,950,535 | 0 | Streams LoRa files from the archive; uses epoch timestamps; separates air and fruit-surface values |
| `RetailProduceCasesAdapter` | `data/external/retail-produce-cases/retail data FC.xlsx` | 224 aggregate records | 0 | Preserves mean/min/max and abuse summaries; leaves timestamp null |

Counts above were produced by streaming the complete selected inputs through Pydantic validation on 2026-09-25. The machine-readable report is `artifacts/data-adapters/verification.json`. Invalid source values are not coerced into plausible observations: malformed mango quality cells, non-finite apple readings, and milk missing-value sentinels are skipped.

## In-app measured-data samples

The Field data page can browse all five sources. Strawberry shipment telemetry is read from the bundled public benchmark. The other four sources are exported from their canonical adapters into `public/field-data-samples.json` by `scripts/generate_field_data_samples.py` (also available as `npm run data:samples`). The generator streams the source adapters, counts every validated observation and quality record, then retains a bounded view for the local browser:

- Mango: one logger box in the most densely recorded route stage. Route stages are not stitched together because their naive source timestamps use different local timezones.
- Milk: the most densely recorded UTC tank day for one probe pair. Laboratory records appear in their own table and are not joined to those probe readings.
- Apple: one logger pair from the test with the most source records. Its deterministic reservoir sample retains observed extremes as well as representative points.
- Retail: 12 case-position aggregate rows selected by descending mean temperature. The source has no timestamps, so the app does not draw a fabricated time series.
- Strawberry: the existing six-shipment explorer remains the detailed view.

Each example links to its dataset record, displays license and scope, and keeps source-row locators. The JSON is a compact display sample, not a replacement for the raw data, a training export, or a model evaluation. None of these examples is passed into the Node RSL estimate. In particular, the mango/milk physical or lab measurements remain separate from temperature history until a source-appropriate, documented join is validated.

## Download and reproducibility

Install the data-tooling dependencies and download or verify the sources:

```powershell
python -m pip install -r requirements-data.txt
python scripts/download_open_datasets.py
python scripts/verify_data_adapters.py
```

The downloader uses public repository endpoints, excludes irrelevant image/plot and milk IMU files where possible, and writes `data/external/manifest.json` with byte sizes and SHA-256 hashes. Raw external files are excluded from Git because of size and separate licenses.

Export a canonical JSONL sample or full stream for training:

```powershell
python scripts/export_sensor_observations.py mango artifacts/mango-sample.jsonl --limit 1000
python scripts/export_sensor_observations.py milk artifacts/milk-observations.jsonl
```

Available dataset names are `mango`, `milk`, `strawberry`, `apple`, and `retail`. Training code may also import the adapter registry from `coldchain.data.catalog` and stream records without producing a large intermediate file.

## How the sources back operational predictions

The sources cover different parts of the prediction stack rather than acting as one interchangeable training table:

1. Mango provides the clearest measured link between a real international thermal route and later quality attributes. It is appropriate for prototype product-quality targets after box/sample alignment and grouped evaluation.
2. Milk provides dense real storage temperatures and laboratory measurements. It can support dairy-specific feature work after defining a defensible temporal join between collection samples and preceding tank exposure.
3. Strawberry provides real multi-position transport dynamics. It is useful for sensor health, spatial gradients, and early-warning experiments, while its weak R2 label must stay separate from RSL claims.
4. Apple provides high-volume air, surface, and humidity measurements under varied cooling and ventilation conditions. It supports condensation and storage-control features but no direct RSL supervision.
5. Retail produce cases provide realistic final-stage temperature distributions and door/position effects for priors and simulations. Their aggregate nature prevents sequence or event-delay evaluation.

A production RSL model should therefore be product-specific. A mango quality model must not be presented as a milk, strawberry, or apple model. Cross-source pretraining may learn temperature-pattern representations, but final calibration and evaluation require the target product's measured endpoints and group-held-out batches, routes, or facilities.

## Splitting, joins, and leakage controls

- Hold out complete strawberry shipments, mango boxes or assessment groups, apple tests/bins, milk collection periods, and retail cases. Never split neighboring rows randomly across train and test.
- Fit scalers, imputers, feature selection, and model parameters on training groups only.
- Treat mango route timestamps as local source times whose timezone changes by stage. Do not order unrelated stages by converting naive timestamps to an invented timezone.
- Join milk laboratory samples only through an explicitly documented look-back window. Report sensitivity to that window; the source does not assert that each lab value belongs to one exact sensor reading.
- Keep the strawberry future-R2 fields out of predictors. They are evaluation labels for a temperature-rule task.
- Do not upsample the retail aggregates into fabricated time series.

## Licensing and governance

| Dataset | Declared terms | Production implication |
|---|---|---|
| Mango air cargo | CC BY-NC-SA 4.0 | Suitable for this noncommercial science-fair prototype; obtain permission or replace it before commercial training/deployment |
| Bulk milk tank | CC BY 4.0 | Attribution required |
| Strawberry transportation release | Apache-2.0 declared by upstream card | Preserve notice and license; derived original sensor data provenance remains cited |
| Commercial apple storage | CC BY 4.0 | Attribution required |
| Retail produce cases | CC BY 4.0 | Attribution required |

The project code remains MIT-licensed. Dataset terms apply independently. Source citations and the local file manifest are kept in `data/external/README.md` and `data/external/manifest.json`.

## Remaining gaps before production

- No Qatar/GCC food shipment combines temperature, humidity, GPS, handoffs, storage records, and measured quality outcomes in the current open-data bundle.
- Only the mango and milk sources provide practical product-quality measurements; their targets and operating contexts differ.
- None of these datasets authorizes the app to declare food safe, sellable, consumable, or suitable for donation.
- Product-specific microbial or sensory rejection endpoints and censored failure times are still needed for defensible RSL calibration.
- External Qatar routes, seasons, facilities, packaging, and sensor hardware require local validation.
- Commercial use of the mango source requires separate rights clearance.

The current data layer proves that the ingestion and provenance architecture can handle real operational telemetry. It does not yet prove production RSL accuracy in Qatar.
