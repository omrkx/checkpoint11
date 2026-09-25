# Bulk milk raw-data cache

The reproducible training pipeline uses **Dataset on Bulk Milk Tank Performance, version 3** from Mendeley Data, DOI [10.17632/2sw758pw38.3](https://data.mendeley.com/datasets/2sw758pw38/3), licensed CC BY 4.0. Run `python -m ml.training.train` to download the pinned public archive if it is not already present here.

The source archive is deliberately ignored by Git because it is large (about 156 MB compressed and about 1 GB expanded). The training pipeline records its SHA-256 hash and expected version in its output metadata. Keep the source citation and license with any redistributed derived data or model.
