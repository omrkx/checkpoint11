"""Product-specific prediction registry for optional measured-data models.

The registry deliberately has no cross-product or universal fallback. Callers
must pass the product type used to train a model and a flat mapping of that
model's engineered feature values. Missing model artifacts or Python ML
dependencies return an ``unavailable`` result so an application can continue
using its existing physics-based decision path.

Model artifact layout (``models_dir`` is the parent directory)::

    models/
      milk_quality_v1/
        model.joblib
        feature_schema.json
        model_card.json

``feature_schema.json`` must declare the estimator's ordered inputs in a
``features`` list (strings or objects with a ``name`` field), a
``feature_names`` list, or a mapping under ``features``. The target and unit
may be declared in this file or in ``model_card.json``. All declared inputs
are required and numeric; extra or missing keys are rejected.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import math
from numbers import Real
from pathlib import Path
import re
from typing import Any, Literal, Mapping


PredictionStatus = Literal[
    "ready",
    "unsupported_product",
    "unavailable",
    "invalid_input",
]


@dataclass(frozen=True)
class ModelRegistration:
    """A product key points to exactly one product-specific model artifact."""

    product_type: str
    model_name: str


@dataclass(frozen=True)
class PredictionResult:
    """Serializable result returned by :func:`predict` and :class:`ModelRegistry`.

    ``metadata`` contains the model card when it could be loaded. ``reason``
    explains an unavailable, unsupported, or invalid-input result without
    raising into the caller's physics-based fallback path.
    """

    status: PredictionStatus
    product_type: str
    model_name: str | None = None
    prediction: float | None = None
    target: str | None = None
    unit: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a plain JSON-serializable representation."""

        return {
            "status": self.status,
            "product_type": self.product_type,
            "model_name": self.model_name,
            "prediction": self.prediction,
            "target": self.target,
            "unit": self.unit,
            "metadata": dict(self.metadata),
            "reason": self.reason,
        }


class ModelRegistry:
    """Dispatch product types to their own optional model bundles.

    Future products can be added with :meth:`register` without adding product
    branches to :meth:`predict`. Each registration still resolves to its own
    model artifact directory and feature schema.
    """

    def __init__(self) -> None:
        self._models: dict[str, ModelRegistration] = {}

    def register(
        self,
        product_type: str,
        model_name: str,
        *,
        replace: bool = False,
    ) -> None:
        """Register one explicit product-to-model mapping.

        Product and model identifiers are path-safe lowercase identifiers.
        Duplicate registrations fail unless ``replace=True`` is intentional.
        """

        if not isinstance(product_type, str) or not _IDENTIFIER.fullmatch(product_type):
            raise ValueError("product_type must be a lowercase path-safe identifier")
        if not isinstance(model_name, str) or not _IDENTIFIER.fullmatch(model_name):
            raise ValueError("model_name must be a lowercase path-safe identifier")
        if product_type in self._models and not replace:
            raise ValueError(f"A model is already registered for {product_type!r}")
        self._models[product_type] = ModelRegistration(product_type, model_name)

    def registrations(self) -> dict[str, ModelRegistration]:
        """Return a copy of the current product registrations."""

        return dict(self._models)

    def predict(
        self,
        product_type: str,
        telemetry: Mapping[str, object],
        models_dir: str | Path | None = None,
    ) -> PredictionResult:
        """Load and run the registered model for a product type.

        ``telemetry`` must already be transformed into feature values named by
        the model's feature schema. The raw app product ID ``milk`` is not an
        alias for ``raw_bulk_milk_tank`` and therefore remains unsupported.
        No exception from artifact loading or estimator inference escapes this
        boundary; an application may continue with its physics-based path.
        """

        registration = self._models.get(product_type)
        if registration is None:
            return PredictionResult(
                status="unsupported_product",
                product_type=product_type if isinstance(product_type, str) else "",
                reason="No product-specific model is registered for this product type.",
            )

        model_root = (
            Path(models_dir)
            if models_dir is not None
            else Path(__file__).resolve().parent / "models"
        )
        artifact_dir = model_root / registration.model_name
        model_path = artifact_dir / "model.joblib"
        schema_path = artifact_dir / "feature_schema.json"
        card_path = artifact_dir / "model_card.json"

        missing = [
            path.name
            for path in (model_path, schema_path, card_path)
            if not path.is_file()
        ]
        if missing:
            return self._unavailable(
                registration,
                f"Model artifact files are missing: {', '.join(missing)}.",
            )

        try:
            feature_schema = _read_json_object(schema_path)
            model_card = _read_json_object(card_path)
            feature_names = _feature_names(feature_schema)
            target, unit = _target_and_unit(feature_schema, model_card)
            _validate_bundle_identity(registration, feature_schema, model_card)
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
            return self._unavailable(
                registration,
                f"Model metadata is invalid: {exc}",
            )

        feature_values, input_error = _validate_input(telemetry, feature_names)
        if input_error is not None:
            return PredictionResult(
                status="invalid_input",
                product_type=registration.product_type,
                model_name=registration.model_name,
                target=target,
                unit=unit,
                metadata=model_card,
                reason=input_error,
            )

        try:
            # Import lazily so the app and registry metadata remain usable when
            # optional ML dependencies are not installed.
            import joblib
            import sklearn  # noqa: F401  # required by serialized sklearn models

            estimator = joblib.load(model_path)
        except ImportError:
            return self._unavailable(
                registration,
                "scikit-learn and joblib are required to load this model.",
                model_card=model_card,
                target=target,
                unit=unit,
            )
        except Exception:
            return self._unavailable(
                registration,
                "The model artifact could not be loaded.",
                model_card=model_card,
                target=target,
                unit=unit,
            )

        try:
            raw_prediction = estimator.predict(
                [[feature_values[name] for name in feature_names]]
            )
            prediction = _single_finite_prediction(raw_prediction)
        except Exception:
            return self._unavailable(
                registration,
                "The registered model could not produce a valid prediction.",
                model_card=model_card,
                target=target,
                unit=unit,
            )

        return PredictionResult(
            status="ready",
            product_type=registration.product_type,
            model_name=registration.model_name,
            prediction=prediction,
            target=target,
            unit=unit,
            metadata=model_card,
        )

    @staticmethod
    def _unavailable(
        registration: ModelRegistration,
        reason: str,
        *,
        model_card: Mapping[str, Any] | None = None,
        target: str | None = None,
        unit: str | None = None,
    ) -> PredictionResult:
        return PredictionResult(
            status="unavailable",
            product_type=registration.product_type,
            model_name=registration.model_name,
            target=target,
            unit=unit,
            metadata=model_card or {},
            reason=reason,
        )


_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]*$")

registry = ModelRegistry()
registry.register("raw_bulk_milk_tank", "milk_quality_v1")


def register_model(
    product_type: str,
    model_name: str,
    *,
    replace: bool = False,
) -> None:
    """Register a future product-specific model on the module registry."""

    registry.register(product_type, model_name, replace=replace)


def registered_models() -> dict[str, ModelRegistration]:
    """Return a copy of registered product/model pairs."""

    return registry.registrations()


def predict(
    product_type: str,
    telemetry: Mapping[str, object],
    models_dir: str | Path | None = None,
) -> PredictionResult:
    """Predict with the exact product-specific model registered for a product.

    The default model root is ``ml/models``. Passing ``models_dir`` overrides
    that parent directory, which is useful for isolated deployments and
    artifact verification. Unsupported product types—including the app's
    plain ``milk`` ID—return ``unsupported_product`` rather than using the raw
    tank model or any universal fallback.
    """

    return registry.predict(product_type, telemetry, models_dir)


def _read_json_object(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise TypeError(f"{path.name} must contain a JSON object")
    return value


def _feature_names(feature_schema: Mapping[str, Any]) -> tuple[str, ...]:
    """Read the ordered feature names from a small number of schema shapes."""

    raw_features: object = feature_schema.get("features")
    if raw_features is None:
        raw_features = feature_schema.get("feature_names")

    if isinstance(raw_features, Mapping):
        candidates: list[object] = list(raw_features.keys())
    elif isinstance(raw_features, list):
        candidates = raw_features
    else:
        raise ValueError("feature_schema.json must declare a features list or mapping")

    names: list[str] = []
    for candidate in candidates:
        if isinstance(candidate, str):
            name = candidate
        elif isinstance(candidate, Mapping):
            name = candidate.get("name")
        else:
            name = None
        if not isinstance(name, str) or not name.strip():
            raise ValueError("each feature must have a non-empty string name")
        names.append(name.strip())

    if not names:
        raise ValueError("feature_schema.json declares no model features")
    if len(set(names)) != len(names):
        raise ValueError("feature_schema.json contains duplicate feature names")
    return tuple(names)


def _target_and_unit(
    feature_schema: Mapping[str, Any],
    model_card: Mapping[str, Any],
) -> tuple[str, str]:
    raw_target: object = feature_schema.get("target")
    if raw_target is None:
        raw_target = model_card.get("target")

    target_unit: object = feature_schema.get("target_unit")
    if target_unit is None:
        target_unit = feature_schema.get("unit")
    if target_unit is None:
        target_unit = model_card.get("target_unit")
    if target_unit is None:
        target_unit = model_card.get("unit")

    if isinstance(raw_target, Mapping):
        target_name = raw_target.get("name") or raw_target.get("target")
        if target_unit is None:
            target_unit = raw_target.get("unit")
    else:
        target_name = raw_target

    if not isinstance(target_name, str) or not target_name.strip():
        raise ValueError("model metadata must declare a target name")
    if not isinstance(target_unit, str) or not target_unit.strip():
        raise ValueError("model metadata must declare a target unit")
    return target_name.strip(), target_unit.strip()


def _validate_bundle_identity(
    registration: ModelRegistration,
    feature_schema: Mapping[str, Any],
    model_card: Mapping[str, Any],
) -> None:
    """Reject artifact bundles that explicitly identify another model/product."""

    for metadata in (feature_schema, model_card):
        declared_model = metadata.get("model_name")
        if declared_model is None:
            declared_model = metadata.get("name")
        if declared_model is not None and declared_model != registration.model_name:
            raise ValueError("model metadata does not match the registered model name")

        declared_product = metadata.get("product_type")
        if declared_product is not None and declared_product != registration.product_type:
            raise ValueError("model metadata does not match the registered product type")


def _validate_input(
    telemetry: Mapping[str, object],
    feature_names: tuple[str, ...],
) -> tuple[dict[str, float], str | None]:
    if not isinstance(telemetry, Mapping):
        return {}, "Telemetry must be a mapping of model feature names to numeric values."

    expected = set(feature_names)
    provided = set(telemetry.keys())
    missing = sorted(expected - provided)
    extra = sorted(key for key in provided - expected if isinstance(key, str))
    non_string_keys = [key for key in provided - expected if not isinstance(key, str)]
    if missing or extra or non_string_keys:
        parts = []
        if missing:
            parts.append(f"missing features: {', '.join(missing)}")
        if extra:
            parts.append(f"unexpected features: {', '.join(extra)}")
        if non_string_keys:
            parts.append("feature names must be strings")
        return {}, "; ".join(parts)

    values: dict[str, float] = {}
    for name in feature_names:
        value = telemetry[name]
        if isinstance(value, bool) or not isinstance(value, Real):
            return {}, f"Feature {name!r} must be a numeric value."
        numeric_value = float(value)
        if not math.isfinite(numeric_value):
            return {}, f"Feature {name!r} must be finite."
        values[name] = numeric_value
    return values, None


def _single_finite_prediction(raw_prediction: object) -> float:
    """Require exactly one finite regression prediction from one row."""

    if hasattr(raw_prediction, "tolist"):
        raw_prediction = raw_prediction.tolist()
    if not isinstance(raw_prediction, (list, tuple)) or len(raw_prediction) != 1:
        raise ValueError("model must return exactly one prediction")
    value = raw_prediction[0]
    if isinstance(value, (list, tuple)):
        if len(value) != 1:
            raise ValueError("model output must be a scalar regression value")
        value = value[0]
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError("model output must be numeric")
    prediction = float(value)
    if not math.isfinite(prediction):
        raise ValueError("model output must be finite")
    return prediction
