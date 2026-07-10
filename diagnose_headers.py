"""Read-only diagnostics for complex Tesouro Gerencial table headers.

This script does not generate data and does not change the production parser.
It exists to inspect merged cells, multi-row headers, and risky report shapes
before any parsing change is attempted.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent

CRITICAL_REPORTS = [
    "restos-a-pagar-rap.html",
    "saldos-de-contas-de-contratos.html",
    "evolucao-das-despesas-empenhadas.html",
    "despesas-empenhadas-liquidadas-e-pagas-mes-lancamento.html",
    "saldos-de-empenhos-do-exercicio-conta-contabil.html",
    "saldo-de-empenhos-a-liquidar-mes-a-mes.html",
    "credito-disponivel-mes-lancamento.html",
    "provisionamentos.html",
    "recolhimento-proprio-gru.html",
]


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def span_int(cell: Any, attr: str) -> int:
    try:
        return max(1, int(cell.get(attr, 1)))
    except (TypeError, ValueError):
        return 1


def cell_texts(row: Any) -> list[str]:
    return [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["td", "th"])]


def expanded_width(row: Any) -> int:
    return sum(span_int(cell, "colspan") for cell in row.find_all(["td", "th"]))


def has_spans(row: Any) -> bool:
    for cell in row.find_all(["td", "th"]):
        if span_int(cell, "colspan") > 1 or span_int(cell, "rowspan") > 1:
            return True
    return False


def numeric_like(value: str) -> bool:
    value = clean_text(value)
    if not value:
        return False
    cleaned = re.sub(r"[^\d,.-]", "", value)
    return bool(re.fullmatch(r"-?\d+(?:[.,]\d+)*", cleaned))


def header_score(texts: list[str]) -> int:
    non_empty = [text for text in texts if text]
    if len(non_empty) < 2:
        return 0
    numeric = sum(1 for text in non_empty if numeric_like(text))
    words = sum(1 for text in non_empty if re.search(r"[A-Za-zÀ-ÿ]", text))
    technical_terms = sum(
        1
        for text in non_empty
        if re.search(r"valor|saldo|pago|pagar|conta|natureza|ug|data|mes|mês|r\$", text, re.I)
    )
    return words + technical_terms - numeric


def summarize_report(path: Path, max_rows: int) -> dict[str, Any]:
    html = path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    table_summaries = []

    for table_index, table in enumerate(tables, start=1):
        rows = table.find_all("tr")
        widths = [expanded_width(row) for row in rows]
        span_rows = [idx for idx, row in enumerate(rows[:max_rows], start=1) if has_spans(row)]
        candidates = []
        for idx, row in enumerate(rows[:max_rows], start=1):
            texts = cell_texts(row)
            score = header_score(texts)
            if score > 0:
                candidates.append(
                    {
                        "row": idx,
                        "score": score,
                        "width": expanded_width(row),
                        "sample": " | ".join(texts[:8]),
                        "has_span": has_spans(row),
                    }
                )
        candidates.sort(key=lambda item: (-item["score"], item["row"]))
        table_summaries.append(
            {
                "index": table_index,
                "rows": len(rows),
                "max_width": max(widths) if widths else 0,
                "span_rows": span_rows[:10],
                "candidate_headers": candidates[:5],
            }
        )

    table_summaries.sort(key=lambda item: (item["rows"], item["max_width"]), reverse=True)
    return {
        "report": path.name,
        "size_bytes": path.stat().st_size,
        "tables": len(tables),
        "largest_tables": table_summaries[:3],
    }


def print_report(summary: dict[str, Any]) -> None:
    print(f"\n## {summary['report']}")
    print(f"- Tamanho: {summary['size_bytes']} bytes")
    print(f"- Tabelas encontradas: {summary['tables']}")
    for table in summary["largest_tables"]:
        print(
            f"- Tabela #{table['index']}: {table['rows']} linhas, "
            f"largura maxima expandida {table['max_width']}"
        )
        if table["span_rows"]:
            print(f"  - Linhas com colspan/rowspan no inicio: {table['span_rows']}")
        else:
            print("  - Sem colspan/rowspan detectado nas primeiras linhas analisadas")
        for candidate in table["candidate_headers"]:
            span = " com span" if candidate["has_span"] else ""
            print(
                f"  - Candidato cabecalho linha {candidate['row']} "
                f"(score {candidate['score']}, largura {candidate['width']}{span}): "
                f"{candidate['sample'][:220]}"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnostica cabecalhos de relatorios HTML.")
    parser.add_argument(
        "--max-rows",
        type=int,
        default=25,
        help="quantidade de linhas iniciais por tabela analisadas para candidatos a cabecalho",
    )
    parser.add_argument(
        "reports",
        nargs="*",
        help="arquivos HTML especificos; se omitido, usa relatorios criticos",
    )
    args = parser.parse_args()

    targets = args.reports or CRITICAL_REPORTS
    missing = False
    print("# Diagnostico de cabecalhos")
    print("Este diagnostico e somente-leitura e nao altera o parser.")
    for item in targets:
        path = ROOT / item
        if not path.exists():
            missing = True
            print(f"\n## {item}\n- ERRO: arquivo ausente")
            continue
        print_report(summarize_report(path, max(1, args.max_rows)))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
