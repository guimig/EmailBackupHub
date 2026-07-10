"""Experimental RAP metric extraction.

This module is not used by data_generator.py yet. It turns diagnosed RAP total
candidates into auditable metrics only when the source looks sufficiently safe.
"""

from __future__ import annotations

from typing import Any

from rap_metrics import extract_rap_metrics_from_totals


def extract_experimental_rap_metrics(doc: dict[str, Any]) -> dict[str, Any]:
    metrics, metric_sources, issues = extract_rap_metrics_from_totals(doc)
    rap_pago = metrics.get("rap_pago")
    rap_a_pagar = metrics.get("rap_a_pagar")
    if rap_pago is not None and rap_a_pagar is not None:
        total = rap_pago + rap_a_pagar
        if total > 0:
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
        "candidate_count": len(metric_sources),
    }
