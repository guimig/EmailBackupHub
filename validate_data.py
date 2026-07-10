"""Static data validation for EmailBackupHub.

This validator is intentionally read-only. It does not parse HTML reports,
generate JSON, touch IMAP, commit, or mark e-mails as read.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"

ESSENTIAL_HTML = [
    "index.html",
    "dashboard.html",
    "relatorios.html",
    "report-viewer.html",
]

ESSENTIAL_DATA = [
    "index.json",
    "search-index.json",
    "report-definitions.json",
]

SECRET_PATTERNS = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]

RAP_SLUG = "restos-a-pagar-rap"
RAP_METRICS = ("rap_pago", "rap_a_pagar")
SUSPICIOUS_RAP_LIMIT = 100.0


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.checked_json = 0

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def is_sparse_without_data() -> bool:
    sparse_file = ROOT / ".git" / "info" / "sparse-checkout"
    return sparse_file.exists() and not DATA_DIR.exists()


def read_json(path: Path, validation: Validation) -> Any | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        validation.error(f"JSON ausente: {rel(path)}")
        return None
    except json.JSONDecodeError as exc:
        validation.error(f"JSON invalido em {rel(path)}: {exc}")
        return None
    except OSError as exc:
        validation.error(f"Falha ao ler {rel(path)}: {exc}")
        return None
    validation.checked_json += 1
    return data


def parse_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def path_from_data(value: Any) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.split("#", 1)[0].split("?", 1)[0].replace("\\", "/")
    return ROOT / normalized


def report_entries(index_data: Any) -> list[dict[str, Any]]:
    if isinstance(index_data, list):
        return [item for item in index_data if isinstance(item, dict)]
    if isinstance(index_data, dict):
        for key in ("reports", "items", "data"):
            value = index_data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def first_present(item: dict[str, Any], names: tuple[str, ...]) -> Any:
    for name in names:
        if item.get(name) not in (None, ""):
            return item.get(name)
    return None


def validate_static_files(validation: Validation) -> None:
    for item in ESSENTIAL_HTML:
        path = ROOT / item
        if not path.exists():
            validation.error(f"Arquivo HTML essencial ausente: {item}")
        elif path.stat().st_size == 0:
            validation.error(f"Arquivo HTML essencial vazio: {item}")

    for html in ("dashboard.html", "report-viewer.html"):
        path = ROOT / html
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"""(?:href|src)=["']/""", text, re.IGNORECASE):
            validation.warn(f"{html} contem caminho absoluto iniciado por /")


def validate_required_data(validation: Validation, strict: bool) -> bool:
    if not DATA_DIR.exists():
        message = "Pasta data/ ausente; validacao dos JSONs foi ignorada."
        if strict or not is_sparse_without_data():
            validation.error(message)
        else:
            validation.warn(message)
        return False

    for item in ESSENTIAL_DATA:
        path = DATA_DIR / item
        if not path.exists():
            validation.error(f"Arquivo essencial ausente: data/{item}")
    return True


def validate_index(validation: Validation) -> list[dict[str, Any]]:
    index_data = read_json(DATA_DIR / "index.json", validation)
    if index_data is None:
        return []

    entries = report_entries(index_data)
    if not entries:
        validation.error("data/index.json nao contem lista de relatorios reconhecivel")
        return []

    seen_slugs: set[str] = set()
    for idx, item in enumerate(entries, start=1):
        slug = first_present(item, ("slug", "id", "name"))
        if not isinstance(slug, str) or not slug.strip():
            validation.error(f"Relatorio #{idx} em data/index.json sem slug")
        elif slug in seen_slugs:
            validation.warn(f"Slug duplicado em data/index.json: {slug}")
        else:
            seen_slugs.add(slug)

        for field in ("json_path", "series_path", "html_path", "viewer_path"):
            value = item.get(field)
            if value in (None, ""):
                if field == "viewer_path":
                    validation.warn(f"{slug or '#'+str(idx)} sem viewer_path")
                continue
            path = path_from_data(value)
            if path is not None and field != "viewer_path" and not path.exists():
                validation.error(f"{field} referenciado nao existe: {value}")
            if isinstance(value, str) and value.startswith("/"):
                validation.error(f"{field} usa caminho absoluto: {value}")

        report_date = first_present(item, ("date_iso", "data_iso", "generated_at"))
        if report_date and isinstance(report_date, str) and len(report_date) >= 10:
            if not parse_iso_date(report_date[:10]):
                validation.warn(f"{slug or '#'+str(idx)} tem data invalida: {report_date}")

    return entries


def validate_report_json(path: Path, validation: Validation) -> None:
    data = read_json(path, validation)
    if not isinstance(data, dict):
        validation.error(f"Relatorio JSON nao e objeto: {rel(path)}")
        return

    slug = data.get("slug")
    if not isinstance(slug, str) or not slug:
        validation.error(f"Relatorio sem slug: {rel(path)}")
    if not data.get("schema_version"):
        validation.warn(f"Relatorio sem schema_version: {rel(path)}")

    columns = data.get("columns")
    if columns is not None and not isinstance(columns, list):
        validation.error(f"columns deve ser lista em {rel(path)}")

    totals = data.get("totals")
    if totals is not None and not isinstance(totals, list):
        validation.error(f"totals deve ser lista em {rel(path)}")

    quality = data.get("quality")
    if quality is not None and not isinstance(quality, dict):
        validation.warn(f"quality deveria ser objeto em {rel(path)}")

    if slug == RAP_SLUG:
        validate_rap_metrics_payload(
            validation,
            rel(path),
            data.get("metrics"),
            data.get("metrics_meta") or data.get("metric_sources"),
        )


def numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def validate_rap_metrics_payload(
    validation: Validation,
    location: str,
    metrics: Any,
    metadata: Any,
) -> None:
    if not isinstance(metrics, dict):
        return
    meta = metadata if isinstance(metadata, dict) else {}
    for metric in RAP_METRICS:
        value = numeric(metrics.get(metric))
        if value is not None and 0 < value < SUSPICIOUS_RAP_LIMIT:
            validation.warn(f"RAP suspeito em {location}: {metric}={value}")
        if metric in metrics and metric not in meta:
            validation.warn(f"RAP sem origem auditavel em {location}: {metric}")
            continue
        metric_meta = meta.get(metric)
        if metric_meta is not None and not isinstance(metric_meta, dict):
            validation.warn(f"RAP com metadado invalido em {location}: {metric}")
            continue
        if isinstance(metric_meta, dict):
            status = metric_meta.get("status")
            if status and status != "ok":
                validation.warn(f"RAP com origem nao confirmada em {location}: {metric} status={status}")
            if not (metric_meta.get("source") or metric_meta.get("method")):
                validation.warn(f"RAP sem source/method em {location}: {metric}")


def validate_series_json(path: Path, validation: Validation) -> None:
    data = read_json(path, validation)
    if not isinstance(data, dict):
        validation.error(f"Serie JSON nao e objeto: {rel(path)}")
        return

    slug = data.get("slug") or path.stem
    series = data.get("series")
    if not isinstance(series, list):
        validation.error(f"series deve ser lista em {rel(path)}")
        return

    previous_date = ""
    for idx, item in enumerate(series, start=1):
        if not isinstance(item, dict):
            validation.error(f"Item #{idx} da serie nao e objeto em {rel(path)}")
            continue
        date_iso = item.get("date_iso")
        if not parse_iso_date(date_iso):
            validation.error(f"Item #{idx} com date_iso invalido em {rel(path)}")
        elif previous_date and date_iso < previous_date:
            validation.warn(f"Serie fora de ordem cronologica em {rel(path)}")
        if isinstance(date_iso, str):
            previous_date = date_iso

        metrics = item.get("metrics")
        if metrics is not None and not isinstance(metrics, dict):
            validation.error(f"metrics deve ser objeto ou ausente em {rel(path)} item #{idx}")
            continue

        if slug == RAP_SLUG and isinstance(metrics, dict):
            validate_rap_metrics_payload(
                validation,
                f"{rel(path)} item #{idx}",
                metrics,
                item.get("metrics_meta") or item.get("metric_sources"),
            )


def validate_all_jsons(validation: Validation) -> None:
    reports_dir = DATA_DIR / "reports"
    if reports_dir.exists():
        for path in sorted(reports_dir.glob("*.json")):
            validate_report_json(path, validation)
    else:
        validation.warn("Pasta data/reports ausente")

    series_dir = DATA_DIR / "series"
    if series_dir.exists():
        for path in sorted(series_dir.glob("*.json")):
            validate_series_json(path, validation)
    else:
        validation.warn("Pasta data/series ausente")

    for item in ("search-index.json", "report-definitions.json"):
        path = DATA_DIR / item
        if path.exists():
            read_json(path, validation)


def validate_run_log_security(validation: Validation) -> None:
    path = DATA_DIR / "run-log.json"
    if not path.exists():
        validation.warn("data/run-log.json ausente")
        return
    text = path.read_text(encoding="utf-8", errors="replace")
    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            validation.error(f"Possivel dado sensivel em data/run-log.json: {pattern.pattern}")
    read_json(path, validation)


def print_result(validation: Validation) -> None:
    print("Validacao de dados EmailBackupHub")
    print(f"JSONs verificados: {validation.checked_json}")

    if validation.warnings:
        print("\nAvisos:")
        for warning in validation.warnings:
            print(f"- {warning}")

    if validation.errors:
        print("\nErros:")
        for error in validation.errors:
            print(f"- {error}")
    else:
        print("\nOK: nenhum erro critico encontrado.")


def validate_repository(strict: bool = False) -> Validation:
    validation = Validation()
    validate_static_files(validation)
    if validate_required_data(validation, strict=strict):
        validate_index(validation)
        validate_all_jsons(validation)
        validate_run_log_security(validation)
    return validation


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida dados estaticos do EmailBackupHub.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="trata data/ ausente como erro mesmo em checkout sparse",
    )
    args = parser.parse_args()

    validation = validate_repository(strict=args.strict)
    print_result(validation)
    return 1 if validation.errors else 0


if __name__ == "__main__":
    sys.exit(main())
