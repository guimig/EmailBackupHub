"""Auditable RAP metric extraction helpers."""

from __future__ import annotations

from typing import Any


RAP_METRICS = {
    "rap_pago": ["RAP Pago", "Pago", "Valor 11"],
    "rap_a_pagar": ["RAP a Pagar", "A Pagar", "Valor 12"],
}
REQUIRED_RAP_METRICS = ("rap_pago", "rap_a_pagar")
SUSPICIOUS_LOW_LIMIT = 100.0


def numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def label_score(label: str) -> int:
    normalized = (label or "").lower()
    if "total geral" in normalized:
        return 5
    if normalized.strip() == "total":
        return 3
    if "total" in normalized:
        return 2
    return 0


def column_score(column: str) -> int:
    if column.startswith("Valor "):
        return 1
    return 3


def candidate_quality(value: float | None, score: int) -> str:
    if value is None:
        return "ausente"
    if 0 < value < SUSPICIOUS_LOW_LIMIT:
        return "suspeito_baixo"
    if score < 3:
        return "baixa_confianca"
    return "candidato"


def rap_total_candidates(doc: dict[str, Any]) -> list[dict[str, Any]]:
    totals = doc.get("totals") or []
    candidates = []
    for metric, columns in RAP_METRICS.items():
        for total_idx, total in enumerate(totals):
            values = total.get("values") or {}
            raw = total.get("raw") or {}
            label = str(total.get("label") or raw.get("Descricao") or raw.get("Natureza de Despesa") or "")
            for column in columns:
                value = numeric(values.get(column))
                if value is None:
                    continue
                score = label_score(label) + column_score(column)
                candidates.append(
                    {
                        "metric": metric,
                        "value": value,
                        "column": column,
                        "label": label,
                        "total_index": total_idx,
                        "score": score,
                        "quality": candidate_quality(value, score),
                    }
                )
    return sorted(candidates, key=lambda item: (-item["score"], item["metric"], item["total_index"]))


def best_candidates(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any] | None]:
    result: dict[str, dict[str, Any] | None] = {}
    for metric in RAP_METRICS:
        metric_candidates = [
            item for item in candidates if item["metric"] == metric and item["quality"] != "suspeito_baixo"
        ]
        result[metric] = metric_candidates[0] if metric_candidates else None
    return result


def source_from_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "ok",
        "source": "totals",
        "line": candidate.get("label"),
        "column": candidate.get("column"),
        "total_index": candidate.get("total_index"),
        "score": candidate.get("score"),
        "quality": candidate.get("quality"),
        "method": "rap_total_candidate",
        "fallback": str(candidate.get("column") or "").startswith("Valor "),
    }


def extract_rap_metrics_from_totals(doc: dict[str, Any]) -> tuple[dict[str, float], dict[str, dict[str, Any]], list[str]]:
    candidates = rap_total_candidates(doc)
    best = best_candidates(candidates)
    metrics: dict[str, float] = {}
    meta: dict[str, dict[str, Any]] = {}
    issues = []

    for metric in REQUIRED_RAP_METRICS:
        candidate = best.get(metric)
        if not candidate:
            issues.append("rap_metric_unavailable")
            meta[metric] = {
                "status": "unavailable",
                "reason": f"Candidato confiavel para {metric} nao encontrado.",
                "source": "totals",
                "fallback": False,
            }
            continue
        if candidate.get("quality") != "candidato":
            issues.append("rap_metric_invalid")
            meta[metric] = {
                "status": "invalid",
                "reason": f"Qualidade insuficiente para {metric}: {candidate.get('quality')}.",
                "source": "totals",
                "line": candidate.get("label"),
                "column": candidate.get("column"),
                "fallback": str(candidate.get("column") or "").startswith("Valor "),
            }
            continue
        value = candidate.get("value")
        if not isinstance(value, (int, float)):
            issues.append("rap_metric_unavailable")
            continue
        metrics[metric] = float(value)
        meta[metric] = source_from_candidate(candidate)

    rap_pago = metrics.get("rap_pago")
    rap_a_pagar = metrics.get("rap_a_pagar")
    if rap_pago is not None and rap_a_pagar is not None:
        total = rap_pago + rap_a_pagar
        if total <= 0:
            issues.append("rap_metric_invalid")
        elif rap_pago < 0 or rap_a_pagar < 0:
            issues.append("rap_metric_invalid")

    return metrics, meta, sorted(set(issues))
