"""Generate a safe retention audit for historical HTML reports.

This script does not read e-mail, generate report data, commit, push, or delete
files. It only evaluates which HTML files would be retained or ignored by the
current retention policy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from data_generator import grouped_files, parse_date_from_name, rel_path
from retention import build_retention_audit


DEFAULT_OUTPUT = Path("data") / "retention-audit.json"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita a politica de retencao de HTMLs historicos.")
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="caminho do JSON de auditoria a ser gerado",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="mostra o resumo no console sem gravar arquivo",
    )
    args = parser.parse_args()

    audit = build_retention_audit(grouped_files, parse_date_from_name, rel_path)
    summary = audit["summary"]
    print(
        "Retencao HTML: "
        f"{summary['retained_files']} preservados, "
        f"{summary['ignored_by_retention']} ignorados, "
        f"{summary['removal_candidates']} candidatos a remocao."
    )
    print("Modo seguro: nenhum arquivo sera removido por este comando.")

    if not args.no_write:
        output = Path(args.output)
        write_json(output, audit)
        print(f"Auditoria gravada em {output.as_posix()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
