# ColdChain Guardian — Repo Handoff

**Project snapshot:** 25 September 2026  
**App version:** 0.4.0  
**Purpose:** A standalone handoff for sharing this project in a repository and completing a one-time local setup.

## Share the app on GitHub

The app is the **whole project folder**, not this handoff document by itself. To share it manually:

1. On GitHub, create a new **empty** repository. Choose Public if anyone with the link may see the source, or Private and invite the person if access should be limited. Do not initialize it with another README or license; this folder already has them.
2. Open PowerShell in this project folder and run:

   ```powershell
   git init
   git add .
   git status --short
   git commit -m "Share ColdChain Guardian demo"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

   Replace the example GitHub address with the URL of the empty repository you created. Review the `git status` list before committing. The current `.gitignore` excludes `.env` and large raw downloads in `data/external`; keep private keys and restricted source data out of GitHub.
3. Share the repository link with the other person. They can clone or download the project, install Node.js 20+, open PowerShell in the project folder, run `node server.mjs`, and open `http://127.0.0.1:4173/`.

GitHub will show the source files and README, but it will **not run this app at a public web address**. The app needs a Node.js server. If the other person needs to click a live website link instead of running it on their computer, the app must also be deployed to a Node-compatible hosting service.

## What this project is

ColdChain Guardian is a prototype dashboard for monitoring the condition of temperature-sensitive food shipments. It combines temperature history, product assumptions, and journey information to estimate quality loss and remaining shelf life (RSL), highlight shipments that may need attention, and suggest practical next steps.

The app is designed to make the process understandable: **see the shipment → see the issue → understand the possible impact → consider an action**.

## Start the app once

### Requirements

- Node.js 20 or later.
- Python is optional. It is only needed for the data download, adapter, and field-sample generation scripts.
- No paid map or AI service is required for the core demo. The app can run without internet access; the map then uses its local schematic view.

### Run locally on Windows PowerShell

Open PowerShell in the project folder and run:

```powershell
node server.mjs
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) in a browser. Stop the server with **Ctrl+C**.

If port 4173 is already in use, choose another port for that PowerShell session:

```powershell
$env:PORT = '5000'
node server.mjs
```

Then open `http://127.0.0.1:5000/`.

The core app uses Node.js built-ins and has no npm package-install step. The UI is served from the local project. Leaflet, the map library, is vendored locally. OpenStreetMap tiles may be requested as an optional map background when online; the app does not require them to function.

## What is in the app

The current interface includes:

- **Overview:** shipment situation, attention list, and interactive Qatar demo map.
- **Shipments:** individual shipment views and sensor history.
- **Field Data:** summaries and samples derived from selected public datasets.
- **Simulation Lab:** illustrative temperature scenarios and intervention comparisons.
- **Evaluation Lab:** prototype evaluation summaries.
- **Product Models:** the product assumptions used in the prototype.
- **Evidence:** sources, provenance, and limitations.

The overview map supports pan, zoom, route and event inspection, shipment selection, and a short optional animated trip. The watchlist and map are connected so selecting a shipment can focus it on the map. Map routes and moving markers are explicitly simulated; they do not represent live GPS or real customer/warehouse locations. The local map works without downloaded map tiles.

## Data: what is measured and what is simulated

These categories must stay clearly separated when presenting or extending the project.

### Simulated demo scenario

The app starts with six deterministic example shipments. Their Qatar/GCC routes, sensor readings, events, status labels, product assumptions, and operating costs are demo inputs. They show how the product could behave; they are not records of real Qatar shipments.

### Public measured datasets

The data work includes adapters and a compact browser sample for five public datasets:

| Dataset | Why it is useful | Important limit |
| --- | --- | --- |
| Mango air-cargo supply chain, Thailand to France | Sensor observations plus separate fruit-quality measurements; useful for studying a real monitored journey. | One shipment; the listed CC BY-NC-SA 4.0 terms are non-commercial, so commercial reuse requires permission. |
| Bulk milk tank performance | Large volume of tank sensor observations and a smaller set of milk-quality measurements. | Farm-tank conditions do not represent pasteurized milk distribution. Listed as CC BY 4.0. |
| Strawberry cold-chain transportation | Multi-sensor transport observations across six shipments; useful for temperature-event examples. | The target is a rule-derived weak label, not measured spoilage or RSL ground truth. Upstream license is Apache-2.0. |
| Commercial apple cold storage | Large real-world cold-storage sensor record. | It does not provide a direct quality or remaining-shelf-life outcome. Listed as CC BY 4.0. |
| Retail produce cases | Useful retail-level temperature aggregates and operational context. | Small number of aggregates, without the timestamps and outcome labels needed to train an RSL model. Listed as CC BY 4.0. |

The current data card reports **2,247,512 sensor observations** and **7,714 separate quality measurements** across the selected sources. Sensor observations and quality measurements are kept distinct; the adapters do not invent joins between them. The browser sample in `public/field-data-samples.json` is a compact derived sample, not the full raw datasets.

Check each source's current license and attribution before copying source data into a public or commercial repository. In particular, do not redistribute the mango source data for commercial use without the required permission. Raw downloads are not meant to be blindly committed: review `.gitignore`, source terms, size, and provenance first.

More detail is in [`docs/DATA_CARD.md`](docs/DATA_CARD.md), and map behavior and sourcing are described in [`docs/MAP_DESIGN.md`](docs/MAP_DESIGN.md).

## What the model outputs mean

- **RSL (Remaining Shelf Life):** an estimate of how much usable quality life may remain under the model's assumptions. It is not an expiry-date guarantee or a food-safety clearance.
- **Quality Debt:** an illustrative measure of quality loss associated with the modeled thermal history, expressed in equivalent time. More debt means the assumed product has used more of its quality-life budget.
- **P10–P90 range:** a broad uncertainty interval from illustrative Monte Carlo scenarios. P10 is the lower tenth-percentile result; P90 is the upper ninetieth-percentile result. It communicates that outcomes vary under the assumptions; it is not a calibrated confidence interval for Qatar shipments.
- **Status and recommendations:** prototype rules rank attention and possible actions. They are aids for review, not autonomous decisions.

The current RSL calculation is an Arrhenius-style equivalent-age physics proxy, not a trained, product-validated shelf-life model. Product-specific parameters and some operating assumptions are demo inputs. ML-only and residual-RSL predictions remain inactive until there are appropriate measured product-quality endpoints. The prototype cannot establish pathogen safety, approve food for sale, or authorize surplus redistribution. A surplus redirection is blocked unless the required safety clearance is explicitly available.

## Optional data setup

Use Python only when you need to download/refresh the public source files or regenerate the browser samples. From the project folder:

```powershell
python -m pip install -r requirements-data.txt
python scripts/download_open_datasets.py
python scripts/verify_data_adapters.py
python scripts/generate_field_data_samples.py
```

Downloads depend on the upstream sources being available and can be large. Review dataset terms before redistributing them. Do not commit private credentials or restricted source data.

## Evaluation and demo artifacts

Useful commands include:

```powershell
node scripts/evaluate.mjs
node scripts/generate_synthetic_demo_pack.mjs
node scripts/evaluate_public_strawberry.mjs
```

These commands write evaluation/demo artifacts under `artifacts/`. The synthetic evaluation checks known generated scenarios. The strawberry benchmark uses a rule-derived temperature-event label and only six shipment groups; it is not evidence that the app accurately predicts spoilage or RSL. Read the report labels and `docs/DATA_CARD.md` before quoting a metric.

The server also exposes local API routes for shipment summaries, observation ingestion, RSL/anomaly outputs, alerts, simulation, recommendations, and the optional advisor. See [`README.md`](README.md) for the current route and project details.

## One-time repository handoff

This workspace is currently not initialized as a Git repository. When creating the repo, start from this project folder and review what is included before the first commit.

Recommended repository contents:

- App source, `server.mjs`, scripts, schemas, tests already present in the project, and documentation.
- `public/field-data-samples.json` if the compact sample's provenance and source terms have been checked.
- Vendored Leaflet assets and their license notices under `public/vendor/leaflet/`.
- `.env.example` with blank/example values and the required data-source attribution/license notices.

Keep out of the repository:

- `.env` and any API keys, tokens, passwords, or private operational records.
- Large raw downloads or any source data whose license does not permit redistribution.
- Generated output that is not needed for a reproducible demo.

Before sharing a public repo, inspect `.gitignore`, `README.md`, dataset licenses, and attribution notices together. The repo should include a short explanation that Qatar routes and the six seeded shipments are simulated.

## What would make this production-ready

The prototype demonstrates an end-to-end workflow, but it is not yet a field-validated food-safety or shelf-life system. The most valuable next work is:

1. Collect shipment and product-quality observations with timestamps from a willing operator or controlled study.
2. Have a food scientist or qualified quality team choose product-specific endpoints, limits, and operating procedures.
3. Calibrate and evaluate each product model against held-out real shipments, reporting error and uncertainty coverage.
4. Validate sensors, clocks, missing-data handling, and ingestion against the equipment used in practice.
5. Test recommendations with actual operators, including who is authorized to inspect, reroute, prioritize sale, or redirect surplus.
6. Document privacy, security, monitoring, model updates, and data-source licenses before any operational deployment.

Until this work exists, present the app as a transparent decision-support prototype using public measurements and clearly labeled simulations—not as a validated food-safety authority.

## Project references

- [`README.md`](README.md) — run instructions, architecture, API, and commands.
- [`docs/DATA_CARD.md`](docs/DATA_CARD.md) — selected datasets, counts, licenses, adapters, and benchmark limits.
- [`docs/MAP_DESIGN.md`](docs/MAP_DESIGN.md) — interactive map, offline behavior, and simulation disclosures.
- [`.env.example`](.env.example) — optional configuration template. Keep real secrets in a local `.env` file and out of Git.
