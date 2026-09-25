---
license: apache-2.0
language:
  - en
pretty_name: Cold-Chain Transportation Strawberry Dataset for ADVEI Article Release
tags:
  - time-series
  - cold-chain
  - early-warning
  - risk-prediction
  - human-centric-ai
  - supply-chain
  - explainability
  - prescriptive-analytics
task_categories:
  - tabular-classification
size_categories:
  - 10K<n<100K
---

# Cold-Chain Transportation Strawberry Dataset — ADVEI Article Release

This repository provides the processed dataset used in the accepted *Advanced Engineering Informatics* article:

**A Human-Centric Edge-Oriented Decision Support System for Cold Chain Transportation: Early Warning, Trigger-Time Explanation, and Prescriptive Action Ranking**

To be published in: *Advanced Engineering Informatics*.

## Final Article Release

The finalized article-release dataset is hosted directly in this Hugging Face repository and can be viewed or downloaded using the links below:

| File | Hugging Face |
|---|---|
| `ALL_benchmark_W60.parquet` | [View or download](article_release/ALL_benchmark_W60.parquet) |
| `ALL_benchmark_W60.xlsx` | [View or download](article_release/ALL_benchmark_W60.xlsx) |

The Parquet file is recommended for programmatic use. The Excel file is provided for convenient inspection.

If the Hugging Face preview or download is temporarily unavailable, the same files can be downloaded from the following public Google Drive backup folder:

[Download from the Google Drive backup mirror](https://drive.google.com/drive/folders/1nGwz-wM6gM68djXA60qpG-73-kPFidKW?usp=sharing)

Detailed download instructions are available at:

[`article_release/DOWNLOAD_DATA.md`](article_release/DOWNLOAD_DATA.md)

The final article-release table contains the integrated W60 processed benchmark used in the study, including shipment identifiers, timestamps, resampled multi-sensor temperature records, engineered W60 features, risk labels, future severe-risk prediction targets, cause flags for explanation consistency checking, and evaluation/audit-related fields.

---

## Dataset Summary

- **Domain:** Cold-chain logistics for strawberry transportation
- **Source:** Public strawberry cold-chain transportation dataset
- **Entities:** 6 shipments (`S1`–`S6`)
- **Sensors:** 9 temperature probe positions per timestamp
- **Sensor layout:** Front / Middle / Rear × Top / Middle / Bottom
- **Sampling interval after processing:** 10 minutes
- **Feature window:** W60, using the past 60 minutes
- **Primary prediction horizon:** 120 minutes
- **Primary target:** `y_next_120_R2`
- **Main evaluation setting:** leave-one-shipment-out (LOSO) generalization

The primary task is to predict, at time `t`, whether the shipment will enter a severe-risk state (`R2`) within the next 120 minutes, using 10-minute sampled multi-sensor temperature data and engineered past-window statistics.

This dataset supports research on:

- cold-chain early-warning prediction;
- deployment-like generalization across unseen shipments;
- event-level alerting evaluation rather than point-wise classification only;
- trigger-time explanation and weak-supervision consistency checking;
- human-centric decision support and prescriptive action ranking.

---

## Repository Structure

```text
Cold-Chain-Transportation-Strawberry/
├── article_release/
│   ├── ALL_benchmark_W60.parquet
│   ├── ALL_benchmark_W60.xlsx
│   └── DOWNLOAD_DATA.md
├── data/
│   ├── w60_S1.parquet
│   ├── w60_S2.parquet
│   ├── w60_S3.parquet
│   ├── w60_S4.parquet
│   ├── w60_S5.parquet
│   ├── w60_S6.parquet
│   └── w60_all.parquet
├── folds/
├── splits/
├── benchmark_v2/
├── benchmark_v2_pca/
└── README.md
```

The two finalized files under `article_release/` are the primary files for reproducing or inspecting the dataset used in the accepted ADVEI article. A public Google Drive backup mirror is provided in `article_release/DOWNLOAD_DATA.md`.

## Recommended Files

The authoritative processed dataset for the accepted ADVEI article is:

```text
article_release/ALL_benchmark_W60.parquet
```

The corresponding Excel file is:

```text
article_release/ALL_benchmark_W60.xlsx
```

The Parquet file is recommended for programmatic analysis. The Excel file contains the same article-release dataset in a format suitable for convenient inspection.

If either Hugging Face file is temporarily unavailable, use the public Google Drive backup mirror:

[Open the Google Drive backup folder](https://drive.google.com/drive/folders/1nGwz-wM6gM68djXA60qpG-73-kPFidKW?usp=sharing)

The six shipment-level files under `data/` are retained for shipment-level inspection:

```text
data/w60_S1.parquet
data/w60_S2.parquet
data/w60_S3.parquet
data/w60_S4.parquet
data/w60_S5.parquet
data/w60_S6.parquet
```

The all-shipment file under `data/` is retained for convenience:

```text
data/w60_all.parquet
```

The folders `benchmark_v2/` and `benchmark_v2_pca/` are earlier or auxiliary processed releases. They are retained for transparency but are not the primary files for reproducing the accepted ADVEI article.

For the final article release, use the files under `article_release/`.

---

## Primary Prediction Task

### Target Label

```text
y_next_120_R2
```

### Meaning

At time `t`, predict whether the shipment will enter the severe-risk state `R2` within the next 120 minutes.

- `1` = the shipment will enter R2 within the prediction horizon
- `0` = the shipment will not enter R2 within the prediction horizon

Future labels such as `y_next_*` and time-to-event fields such as `eta_to_R2_*` are provided for ground truth and evaluation only. They must not be used as predictive input features.

---

## How to Load

### Load the final article-release Parquet file

```python
from huggingface_hub import hf_hub_download
import pandas as pd

repo_id = "NifferLi/Cold-Chain-Transportation-Strawberry"

path = hf_hub_download(
    repo_id=repo_id,
    filename="article_release/ALL_benchmark_W60.parquet",
    repo_type="dataset"
)

df = pd.read_parquet(path)

print(df.shape)
print(df.head())
```

### Load the Excel version

```python
from huggingface_hub import hf_hub_download
import pandas as pd

repo_id = "NifferLi/Cold-Chain-Transportation-Strawberry"

path = hf_hub_download(
    repo_id=repo_id,
    filename="article_release/ALL_benchmark_W60.xlsx",
    repo_type="dataset"
)

df = pd.read_excel(path)

print(df.shape)
print(df.head())
```

### Backup Download

If the Hugging Face preview or download is temporarily unavailable, download the same files from the public Google Drive backup folder:

[Google Drive backup folder](https://drive.google.com/drive/folders/1nGwz-wM6gM68djXA60qpG-73-kPFidKW?usp=sharing)

After downloading, the files can be loaded locally:

```python
import pandas as pd

df_parquet = pd.read_parquet("ALL_benchmark_W60.parquet")
df_excel = pd.read_excel("ALL_benchmark_W60.xlsx")

print(df_parquet.shape)
print(df_excel.shape)
```

### Load a shipment-level Parquet file

```python
from huggingface_hub import hf_hub_download
import pandas as pd

repo_id = "NifferLi/Cold-Chain-Transportation-Strawberry"

path = hf_hub_download(
    repo_id=repo_id,
    filename="data/w60_S1.parquet",
    repo_type="dataset"
)

df_s1 = pd.read_parquet(path)

print(df_s1.shape)
print(df_s1.head())
```

---

## Column Groups

Each row corresponds to one W60 window snapshot for one shipment at one timestamp.

### Identifiers and Time

```text
Time
window_id
window_start_time
window_end_time
shipment_id
```

### Raw Sensor Readings at Time t

```text
Front_Top
Front_Middle
Front_Bottom
Middle_Top
Middle_Middle
Middle_Bottom
Rear_Top
Rear_Middle
Rear_Bottom
```

Missing readings are recorded as `NaN`.

### Missing Masks at Time t

```text
mask_Front_Top
mask_Front_Middle
mask_Front_Bottom
mask_Middle_Top
mask_Middle_Middle
mask_Middle_Bottom
mask_Rear_Top
mask_Rear_Middle
mask_Rear_Bottom
```

### Data Quality and Guardrail Fields

```text
N_valid
coverage_points
N_active_t
coverage_time
sconf
conf_band
conf_level
is_incomplete
is_fail_safe
is_soft_guardrail
is_guardrail
is_trainable
mask_ratio_t
```

### Current Rule-Based Risk Stage

```text
risk_level
label_R0
label_R1
label_R2
```

Risk level definitions:

- `0` = R0, normal
- `1` = R1, warning
- `2` = R2, severe risk

### Cause Flags for Explanation Consistency Checking

```text
cause_high_peak
cause_high_duration
cause_low_peak
cause_low_duration
```

These cause flags are current-time rule-derived indicators based on sensor readings. They are retained for weak-supervision consistency checking and audit purposes.

### Rule Primitives and Current-State Statistics

```text
T_max_window
T_min_window
T_mean
T_std
dur_gt4
dur_lt0
dur_lt_minus1
has_over10
spatial_range_t
spatial_std_t
T_mean_t
hot_ratio_t
cold_ratio_t
```

### Future Labels and Time-to-Event Fields

```text
y_next_60_R2
eta_to_R2_60
y_next_120_R2
eta_to_R2_120
```

These are target or evaluation fields and must not be used as model input features.

### W60 Engineered Features

Examples include:

```text
W60_T_mean
W60_T_std
W60_T_min
W60_T_max
W60_T_range
W60_delta
W60_slope
W60_spatial_range_mean
W60_spatial_range_max
W60_spatial_std_mean
W60_hot_ratio_mean
W60_hot_ratio_max
W60_over_auc_mean
W60_over_auc_max
W60_under_auc_mean
W60_under_auc_max
W60_over_dur_mean
W60_under_dur_mean
W60_active_ratio_mean
W60_mask_ratio_mean
W60_runlen_hot_any_min
W60_runlen_cold_any_min
W60_runlen_hot_mean_min
W60_runlen_cold_mean_min
W60_runlen_hot_any_ratio
W60_runlen_cold_any_ratio
W60_runlen_hot_mean_ratio
W60_runlen_cold_mean_ratio
```

### v4 Engineered Features

Examples include:

```text
v4_over_auc_t
v4_under_auc_t
v4_over_max_t
v4_under_max_t
v4_hot_ratio_t
v4_cold_ratio_t
v4_spatial_range_t
v4_spatial_std_t
v4_median_t
v4_iqr_t
v4_p90_t
v4_p95_t
v4_shock_t
v4_slope_short_t
v4_slope_long_t
v4_accel_t
v4_active_ratio_t
v4_missing_streak_t
```

---

## Leakage Policy

To ensure deployment-realistic evaluation, future labels and evaluation-only fields must be excluded from predictive model inputs.

### Must Exclude from Predictive Inputs

```text
y_next_60_R2
eta_to_R2_60
y_next_120_R2
eta_to_R2_120
risk_level
label_R0
label_R1
label_R2
```

The target column for the main task is:

```text
y_next_120_R2
```

### Cause Flags

```text
cause_high_peak
cause_high_duration
cause_low_peak
cause_low_duration
```

These cause flags are retained for explanation consistency checking and audit purposes. If users train alternative models, they should clearly report whether these fields are included or excluded.

For reproducing the article protocol, users should follow the feature exclusion rules described in the associated article and use the event-level early-warning evaluation protocol.

---

## Evaluation Protocol

### Outer Validation

Use leave-one-shipment-out (LOSO) validation:

- train on 5 shipments;
- test on the held-out shipment;
- repeat for all six shipments;
- report mean and standard deviation across `S1`–`S6`.

### Metrics

Report both point-wise and event-level metrics.

Point-wise metrics may include:

```text
Precision
Recall
F1
```

Event-level metrics may include:

```text
EVENT_F1
EVENT_TP
EVENT_FN
EVENT_FP_OUTSIDE
EVENT_PRED_TOTAL
LEAD_mean
LEAD_median
```

### Event-Level Alerting

Point-wise predictions can be converted into alert events using a persistence-plus-cooldown policy.

Typical operational parameters used in the article pipeline are:

```text
PERSIST_K = 1
COOLDOWN_MIN = 120
```

Event-level evaluation should focus on early warning rather than within-crisis identification. Detections after the shipment is already in R2 should not be rewarded as valid early-warning detections.

---

## Suggested Baselines

### Model Baselines

- ExtraTrees (ET)
- RandomForest (RF)
- Logistic Regression (LOGIT)
- Gradient boosting models such as LightGBM or XGBoost as optional comparisons

### Rule Baselines

Deterministic threshold baselines can be constructed using rule-related primitives such as:

```text
T_max_window
T_min_window
dur_gt4
dur_lt0
dur_lt_minus1
has_over10
```

These rule baselines are useful for sanity checks and interpretability comparisons.

---

## Human-Centric Decision Support Outputs

The dataset was used in a human-centric edge-oriented decision support pipeline including:

- predictive early warning;
- trigger-time local explanation;
- trigger-type probability representation;
- prescriptive action ranking;
- operator-facing structured messages;
- explanation and message audit.

The cause flags and risk-stage fields support weak-supervision consistency checking and audit analysis. The article evaluates the complete system through event-level prediction, explanation consistency, prescriptive action ranking, message audit, and a controlled human-subject decision-support experiment.

---

## Source Dataset

The processed benchmark in this repository is derived from a publicly available strawberry cold-chain transportation dataset:

```text
Abdella, A., Brecht, J. K., & Uysal, I.
A time-temperature dataset for the strawberry cold chain across multiple shipments and locations.
arXiv preprint arXiv:2103.12895.
```

The processed files in this repository provide the article-specific W60 benchmark used for early-warning prediction, explanation, and decision-support evaluation.

---

## Citation

If you use this dataset, please cite the associated article:

```text
Li, H., Uygun, Ö., Yu, X., Zhou, Y., Chang, X., & Chen, C.-H.
A Human-Centric Edge-Oriented Decision Support System for Cold Chain Transportation:
Early Warning, Trigger-Time Explanation, and Prescriptive Action Ranking.
Advanced Engineering Informatics, forthcoming.
```

The DOI and final bibliographic details will be added once available.

You may also cite this dataset repository as:

```bibtex
@dataset{li_coldchain_transportation_strawberry_advei,
  author    = {Li, Hu},
  title     = {Cold-Chain Transportation Strawberry Dataset for ADVEI Article Release},
  publisher = {Hugging Face},
  year      = {2026},
  note      = {Processed dataset for the accepted Advanced Engineering Informatics article}
}
```

---

## Contact

For questions regarding this dataset, please open an issue in this repository or contact the corresponding author listed in the associated article.

---

# Appendix A — Formal Label and Risk Definitions

This appendix summarises the rule-stage labels and future labels used in the processed benchmark.

## A.1 Notation

- Sampling interval: `Δt = 10 minutes`
- Window length: `W = 60 minutes`
- Number of time points in each W60 window: 6
- Number of temperature sensors: 9
- Let `x_{t,s}` denote the temperature at time `t` for sensor `s`.

## A.2 Rule Primitives Computed on the W60 Window

Define per-time-step maxima and minima across sensors:

```text
Tmax_j = max_s x_{j,s}
Tmin_j = min_s x_{j,s}
```

Rule primitives include:

```text
dur_gt4(t)
dur_lt0(t)
dur_lt_minus1(t)
has_over10(t)
T_min_window(t)
T_max_window(t)
```

where:

- `dur_gt4(t)` measures cumulative exposure above 4°C within the W60 window;
- `dur_lt0(t)` measures cumulative exposure below 0°C within the W60 window;
- `dur_lt_minus1(t)` measures cumulative exposure below -1°C within the W60 window;
- `has_over10(t)` indicates whether temperature above 10°C occurs within the W60 window;
- `T_min_window(t)` and `T_max_window(t)` are the minimum and maximum observed temperatures within the W60 window.

## A.3 Cause Indicators

The four cause indicators are:

```text
cause_high_peak
cause_high_duration
cause_low_peak
cause_low_duration
```

They correspond to:

- high-temperature peak excursion;
- sustained high-temperature exposure;
- low-temperature peak excursion;
- sustained low-temperature exposure.

## A.4 Current Rule Risk Stage

The processed benchmark contains:

```text
risk_level
label_R0
label_R1
label_R2
```

The risk levels are:

- `R0`: normal
- `R1`: warning
- `R2`: severe risk

## A.5 Future Labels

The released future-label columns are:

```text
y_next_60_R2
y_next_120_R2
eta_to_R2_60
eta_to_R2_120
```

The primary article task uses:

```text
y_next_120_R2
```

For the article protocol, timestamps already in R2 are included during model training, but detections after the shipment is already in R2 are not rewarded as valid early-warning detections during event-level evaluation. Therefore, users should use the released target columns as provided and apply the event-level early-warning masking rule when reproducing article-level early-warning evaluation.

All future checks are performed within the same shipment.

---

# Appendix B — Data Quality and Guardrails

## B.1 Coverage

At each time `t`:

```text
N_valid(t) = number of observed sensors at time t
coverage_points(t) = N_valid(t) / 9
```

Within the W60 window:

```text
N_active_t(t) = number of active time points in the W60 window
coverage_time(t) = N_active_t(t) / 6
```

## B.2 Confidence Score and Banding

The sensor confidence score is:

```text
sconf(t) = (coverage_points(t) + coverage_time(t)) / 2
```

Confidence bands are encoded in:

```text
conf_band
conf_level
```

The corresponding guardrail fields are:

```text
is_incomplete
is_fail_safe
is_soft_guardrail
is_guardrail
is_trainable
```

These fields are used to distinguish full, partial, and zero-observability regimes and to support audit and reliability handling in the decision-support pipeline.

---

# Appendix C — Practical Feature Grouping

## C.1 Raw Sensors

```text
Front_Top
Front_Middle
Front_Bottom
Middle_Top
Middle_Middle
Middle_Bottom
Rear_Top
Rear_Middle
Rear_Bottom
```

## C.2 Sensor Masks

```text
mask_Front_Top
mask_Front_Middle
mask_Front_Bottom
mask_Middle_Top
mask_Middle_Middle
mask_Middle_Bottom
mask_Rear_Top
mask_Rear_Middle
mask_Rear_Bottom
```

## C.3 Data Quality and Guardrails

```text
N_valid
coverage_points
N_active_t
coverage_time
sconf
conf_band
conf_level
is_incomplete
is_fail_safe
is_soft_guardrail
is_guardrail
is_trainable
mask_ratio_t
```

## C.4 Rule and Audit Fields

```text
risk_level
label_R0
label_R1
label_R2
cause_high_peak
cause_high_duration
cause_low_peak
cause_low_duration
```

## C.5 Future Labels and Evaluation Fields

```text
y_next_60_R2
eta_to_R2_60
y_next_120_R2
eta_to_R2_120
```

## C.6 Window and Engineered Features

Feature families include:

```text
W60_*
v4_*
spatial_*
T_*
dur_*
```

Users should inspect the column names in `article_release/ALL_benchmark_W60.parquet` for the complete feature list.

---

## Changelog

- `article_release`: Final processed benchmark files and download instructions for the accepted ADVEI article.
- `ALL_benchmark_W60.parquet` and `ALL_benchmark_W60.xlsx` are hosted directly in the Hugging Face repository.
- A public Google Drive folder is maintained as a backup mirror in case Hugging Face preview or download is temporarily unavailable.
- Earlier folders such as `benchmark_v2/` and `benchmark_v2_pca/` are retained as legacy or auxiliary processed releases.