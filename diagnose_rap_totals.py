"""Read-only RAP total diagnostics.

This script inspects candidate totals for Restos a Pagar without changing the
production parser or generated data.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

from data_generator import full_report_document
from rap_metrics import best_candidates, rap_total_candidates


ROOT = Path(__file__).resolve().parent
RAP_REPORT = ROOT / "restos-a-pagar-rap.html"


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
