"""Read-only baseline checks for EmailBackupHub.

This script intentionally does not parse reports, generate data, write files, or
touch IMAP/Git. It is a small guardrail for the current functional baseline.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent

ESSENTIAL_FILES = [
    "index.html",
    "dashboard.html",
    "relatorios.html",
    "report-viewer.html",
    "assets/css/dashboard.css",
    "assets/css/report-viewer.css",
    "assets/js/common.js",
    "assets/js/dashboard.js",
    "assets/js/report-viewer.js",
    "main.py",
    "email_processor.py",
    "html_generator.py",
    "data_generator.py",
    "run_logger.py",
    "report_definitions.py",
]

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

CRITICAL_SLUGS = [Path(name).stem for name in CRITICAL_REPORTS]


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def check_required_files(errors: list[str], warnings: list[str]) -> None:
    for item in ESSENTIAL_FILES:
        path = ROOT / item
        if not path.exists():
            errors.append(f"Arquivo essencial ausente: {item}")
        elif path.is_file() and file_size(path) == 0:
            errors.append(f"Arquivo essencial vazio: {item}")

    for item in CRITICAL_REPORTS:
        path = ROOT / item
        if not path.exists():
            errors.append(f"Relatorio critico ausente: {item}")
        elif file_size(path) < 1024:
            warnings.append(f"Relatorio critico muito pequeno: {item}")


def check_report_definitions(errors: list[str], warnings: list[str]) -> None:
    try:
        from report_definitions import REPORT_DEFINITIONS
    except Exception as exc:  # pragma: no cover - defensive CLI path
        errors.append(f"Falha ao importar report_definitions.py: {exc}")
        return

    for slug in CRITICAL_SLUGS:
        definition = REPORT_DEFINITIONS.get(slug)
        if not definition:
            errors.append(f"Slug critico sem definicao central: {slug}")
            continue
        if not str(definition.get("title") or "").strip():
            errors.append(f"Slug critico sem titulo amigavel: {slug}")
        if slug == "restos-a-pagar-rap":
            expected = {"rap_pago", "rap_a_pagar"}
            configured = set(definition.get("expected_metrics") or [])
            missing = sorted(expected - configured)
            if missing:
                errors.append(f"RAP sem metricas esperadas: {', '.join(missing)}")
            rules = definition.get("metric_rules") or {}
            for metric in expected:
                rule = rules.get(metric) or {}
                columns = set(rule.get("columns") or [])
                fallback = set(rule.get("fallback_columns") or [])
                if not columns and not fallback:
                    errors.append(f"RAP sem regra de coluna para {metric}")
                if fallback and not columns:
                    warnings.append(f"RAP depende apenas de fallback posicional para {metric}")


def check_static_links(errors: list[str], warnings: list[str]) -> None:
    html_files = ["index.html", "dashboard.html", "relatorios.html", "report-viewer.html"]
    absolute_link = re.compile(r"""(?:href|src)=["']/""", re.IGNORECASE)

    for item in html_files:
        path = ROOT / item
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if absolute_link.search(text):
            warnings.append(f"{item} contem caminho absoluto iniciado por /")

    dashboard = ROOT / "dashboard.html"
    if dashboard.exists():
        text = dashboard.read_text(encoding="utf-8", errors="replace")
        for asset in ("assets/css/dashboard.css", "assets/js/dashboard.js"):
            if asset not in text:
                errors.append(f"dashboard.html nao referencia {asset}")

    viewer = ROOT / "report-viewer.html"
    if viewer.exists():
        text = viewer.read_text(encoding="utf-8", errors="replace")
        for asset in ("assets/css/report-viewer.css", "assets/js/report-viewer.js"):
            if asset not in text:
                errors.append(f"report-viewer.html nao referencia {asset}")


def check_data_if_present(errors: list[str], warnings: list[str]) -> None:
    data_dir = ROOT / "data"
    if not data_dir.exists():
        warnings.append("Pasta data/ ausente neste checkout; validacao de JSONs foi ignorada.")
        return

    for item in ("index.json", "search-index.json"):
        path = data_dir / item
        if not path.exists():
            warnings.append(f"Arquivo data/{item} ausente")
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"JSON invalido em data/{item}: {exc}")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    check_required_files(errors, warnings)
    check_report_definitions(errors, warnings)
    check_static_links(errors, warnings)
    check_data_if_present(errors, warnings)

    print("Baseline EmailBackupHub")
    print(f"Arquivos essenciais verificados: {len(ESSENTIAL_FILES)}")
    print(f"Relatorios criticos verificados: {len(CRITICAL_REPORTS)}")

    if warnings:
        print("\nAvisos:")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print("\nErros:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("\nOK: baseline estrutural valido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
