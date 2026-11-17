"""Compact read-only dashboard payload from existing report JSONs.

Raw report rows and audited metric provenance are preserved in the source JSONs.
This is an additive, optional summary for the GitHub Pages dashboard.
"""

from __future__ import annotations

from typing import Any

SUMMARY_VERSION = "1"


def compact_series(series_document: dict[str, Any] | None) -> dict[str, Any]:
    items = (series_document or {}).get("series") or []
    allowed = ("date", "date_iso", "hash_conteudo", "metrics", "metrics_meta", "metrics_quality")
    return {
        "series": [
            {key: item[key] for key in allowed if key in item}
            for item in items if isinstance(item, dict)
        ],
    }


def compact_report(document: dict[str, Any], series_document: dict[str, Any] | None) -> dict[str, Any]:
    """Keep columns, audited totals and series, but omit thousands of detail rows."""
    allowed = (
        "slug", "title", "date", "date_iso", "quality", "columns",
        "totals", "metrics", "metrics_meta", "column_schema",
    )
    compact = {key: document[key] for key in allowed if key in document}
    metadata = document.get("metadata") or {}
    compact["metadata"] = {"hash_conteudo": metadata.get("hash_conteudo")}
    compact["row_types"] = [
        item for item in (document.get("row_types") or [])
        if isinstance(item, dict) and item.get("type") == "total"
    ]
    compact["series_data"] = compact_series(series_document)
    return compact


def build_dashboard_summary(
    generated_at: str,
    report_documents: dict[str, dict[str, Any]],
    series_documents: dict[str, dict[str, Any]],
    schema_version: str,
) -> dict[str, Any]:
    return {
        "schema_version": schema_version,
        "summary_version": SUMMARY_VERSION,
        "generated_at": generated_at,
        "reports": {
            slug: compact_report(document, series_documents.get(slug))
            for slug, document in sorted(report_documents.items())
        },
    }
