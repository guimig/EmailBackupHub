"""Experimental RAP metric extraction.

This module is not used by data_generator.py yet. It turns diagnosed RAP total
candidates into auditable metrics only when the source looks sufficiently safe.
"""

from __future__ import annotations

from typing import Any

from diagnose_rap_totals import best_candidates, rap_total_candidates


REQUIRED_RAP_METRICS = ("rap_pago", "rap_a_pagar")


def source_from_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "column": candidate.get("column"),
        "label": candidate.get("label"),
        "total_index": candidate.get("total_index"),
        "score": candidate.get("score"),
        "quality": candidate.get("quality"),
        "method": "experimental_rap_total_candidate",
        "fallback": str(candidate.get("column") or "").startswith("Valor "),
    }


def extract_experimental_rap_metrics(doc: dict[str, Any]) -> dict[str, Any]:
    candidates = rap_total_candidates(doc)
    best = best_candidates(candidates)
    metrics: dict[str, float] = {}
    metric_sources: dict[str, dict[str, Any]] = {}
    issues = []

    for metric in REQUIRED_RAP_METRICS:
        candidate = best.get(metric)
        if not candidate:
            issues.append(f"{metric}_unavailable")
            continue
        if candidate.get("quality") != "candidato":
            issues.append(f"{metric}_{candidate.get('quality')}")
            continue
        value = candidate.get("value")
        if not isinstance(value, (int, float)):
            issues.append(f"{metric}_not_numeric")
            continue
        metrics[metric] = float(value)
        metric_sources[metric] = source_from_candidate(candidate)

    rap_pago = metrics.get("rap_pago")
    rap_a_pagar = metrics.get("rap_a_pagar")
    if rap_pago is not None and rap_a_pagar is not None:
        total = rap_pago + rap_a_pagar
        if total <= 0:
            issues.append("rap_total_not_positive")
        else:
            metrics["rap_total"] = total
            metric_sources["rap_total"] = {
                "method": "sum_rap_pago_rap_a_pagar",
                "components": ["rap_pago", "rap_a_pagar"],
                "quality": "candidato",
                "fallback": any(metric_sources[item].get("fallback") for item in ("rap_pago", "rap_a_pagar")),
            }

    status = "ok" if not issues else "partial" if metrics else "unavailable"
    return {
        "status": status,
        "metrics": metrics,
        "metric_sources": metric_sources,
        "issues": issues,
        "candidate_count": len(candidates),
    }
