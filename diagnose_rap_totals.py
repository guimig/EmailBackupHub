"""Read-only RAP total diagnostics.

This script inspects candidate totals for Restos a Pagar without changing the
production parser or generated data.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path
from typing import Any

from data_generator import full_report_document


ROOT = Path(__file__).resolve().parent
RAP_REPORT = ROOT / "restos-a-pagar-rap.html"
RAP_METRICS = {
    "rap_pago": ["RAP Pago", "Pago", "Valor 11"],
    "rap_a_pagar": ["RAP a Pagar", "A Pagar", "Valor 12"],
}
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


def print_report(doc: dict[str, Any], candidates: list[dict[str, Any]]) -> None:
    print("# Diagnostico RAP")
    print("Somente leitura: nenhum dado e alterado.")
    print(f"- Relatorio: {doc.get('title')}")
    print(f"- Data: {doc.get('date_iso')}")
    print(f"- Totais analisados: {len(doc.get('totals') or [])}")
    best = best_candidates(candidates)
    for metric, candidate in best.items():
        if not candidate:
            print(f"- Melhor candidato {metric}: indisponivel")
            continue
        print(
            f"- Melhor candidato {metric}: valor={candidate['value']} "
            f"coluna={candidate['column']} label={candidate['label']} "
            f"score={candidate['score']} qualidade={candidate['quality']}"
        )
    print("\n## Candidatos")
    for item in candidates[:30]:
        print(
            f"- {item['metric']} valor={item['value']} coluna={item['column']} "
            f"label={item['label']} score={item['score']} qualidade={item['quality']}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnostica candidatos de totais RAP.")
    parser.add_argument("report", nargs="?", default=str(RAP_REPORT), help="HTML RAP a analisar")
    args = parser.parse_args()

    path = Path(args.report)
    if not path.exists():
        print(f"Arquivo ausente: {path}", file=sys.stderr)
        return 1
    doc = full_report_document(path, {}, dt.datetime.now(dt.timezone.utc))
    candidates = rap_total_candidates(doc)
    print_report(doc, candidates)
    return 0


if __name__ == "__main__":
    sys.exit(main())
