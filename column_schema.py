"""Conservative, additive metadata for columns in generic Tesouro reports.

Never rewrites cell values or headers. Unknown reports use the same inference;
explicit per-column overrides are optional exceptions, not a requirement.
"""

from __future__ import annotations

import datetime as dt
import math
import re
import unicodedata
from typing import Any

COLUMN_SCHEMA_VERSION = "1"
SAMPLE_LIMIT = 256
NULL_MARKERS = {"", "-", "--", "n/a", "na", "null", "none", "sem dado"}
MONTHS = {
    "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12,
}
MONTH_TOKENS = "|".join(MONTHS)
PERIOD_RE = re.compile(
    rf"(?<![A-Za-z0-9/])(?P<token>{MONTH_TOKENS}|0\d{{2}}|\d{{2}})/(?P<year>20\d{{2}})(?!\d)",
    re.I,
)
DATE_RE = re.compile(r"(?:\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})\Z")
NUMBER_RE = re.compile(r"[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\Z")
MONEY_WORDS = (
    "valor", "saldo", "liquidado", "liquidada", "empenhado", "empenhada",
    "pago", "paga", "arrecadad", "receita", "movim liquido",
    "provisionad", "credito disponivel", "r$", "montante", "quantia",
)
NUMERIC_WORDS = ("quantidade", "qtd", "total de itens", "numero de dias", "prazo dias")
IDENTIFIER_WORDS = (
    "cpf", "cnpj", "rip", "ptres", "uasg", "ne ccor", "numero processo",
    "num processo", "nr processo", "conta contabil", "fonte recurso", "natureza despesa",
    "codigo", "cod ", "unidade orcamentaria", "nota empenho", "documento habil",
    "numero documento", "identificador", "classificacao", "plano interno",
)
DESCRIPTION_WORDS = ("descricao", "observacao", "historico", "objeto", "justificativa", "favorecido")
PERCENT_WORDS = ("percentual", "percentagem", "porcentagem", "%", "taxa de execucao")
DATE_WORDS = ("data", "emissao dia", "vencimento", "dia pagamento")
PERIOD_WORDS = ("mes", "competencia", "periodo", "exercicio")
FILTERS = {
    "money": "numeric_range", "number": "numeric_range", "percent": "numeric_range",
    "date": "date_range", "period": "period", "category": "multi_select",
    "identifier": "text", "text": "text", "boolean": "multi_select",
}


def _normal(text: Any) -> str:
    text = unicodedata.normalize("NFD", str(text or ""))
    return "".join(char for char in text if not unicodedata.combining(char)).lower()


def _not_missing(value: Any) -> bool:
    return value is not None and _normal(str(value).strip()) not in NULL_MARKERS


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    text = str(value).strip().replace("\u00a0", "")
    if text.startswith("(") and text.endswith(")"):
        text = "-" + text[1:-1].strip()
    text = re.sub(r"^R\$\s*", "", text, flags=re.I)
    text = re.sub(r"\s*%$", "", text).strip()
    if not NUMBER_RE.fullmatch(text):
        return None
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"[+-]?\d{1,3}(?:\.\d{3})+", text):
        text = text.replace(".", "")
    number = float(text)
    return number if math.isfinite(number) else None


def _as_date(value: Any) -> bool:
    if isinstance(value, dt.datetime):
        return True
    if isinstance(value, dt.date):
        return True
    text = str(value).strip()
    if not DATE_RE.fullmatch(text):
        return False
    try:
        dt.datetime.strptime(text, "%d/%m/%Y" if "/" in text else "%Y-%m-%d")
        return True
    except ValueError:
        return False


def period_metadata(value: Any) -> dict[str, Any] | None:
    """Recognize SIAFI accounting periods without casting period 13/14 to dates."""
    match = PERIOD_RE.search(str(value or ""))
    if not match:
        return None
    token = match.group("token").upper()
    year = int(match.group("year"))
    if token in MONTHS:
        return {
            "label": match.group(0), "year": year, "number": MONTHS[token],
            "kind": "calendar_month", "calendar_month": True,
        }
    number = int(token)
    if not 1 <= number <= 14:
        return None
    return {
        "label": match.group(0), "year": year, "number": number,
        "kind": "accounting_period", "calendar_month": False,
    }


def _sample_rows(rows: list[dict[str, Any]], limit: int = SAMPLE_LIMIT) -> list[dict[str, Any]]:
    if len(rows) <= limit:
        return rows
    return [rows[(i * (len(rows) - 1)) // (limit - 1)] for i in range(limit)]


def _infer_type(header: str, values: list[Any]) -> tuple[str, str, str]:
    """Return (type, confidence, source), prioritizing identifiers over numbers."""
    name = _normal(header)
    valid = [value for value in values if _not_missing(value)]
    if not valid:
        if "r$" in name or any(word in name for word in ("valor", "saldo", "empenhad", "liquidad", "pago", "paga")):
            return "money", "low", "header_only"
        if any(word in name for word in PERCENT_WORDS):
            return "percent", "low", "header_only"
        if any(word in name for word in IDENTIFIER_WORDS):
            return "identifier", "low", "header_only"
        return "text", "low", "no_nonempty_samples"
    ratio = lambda predicate: sum(1 for value in valid if predicate(value)) / len(valid)
    numeric = ratio(lambda v: _as_number(v) is not None)
    dates = ratio(_as_date)
    periods = ratio(lambda v: period_metadata(v) is not None and len(str(v).strip()) < 16)
    booleans = ratio(lambda v: _normal(v).strip() in {"sim", "nao", "true", "false", "yes", "no"})
    money_hint = "r$" in name or any(word in name for word in MONEY_WORDS)
    percent_hint = any(word in name for word in PERCENT_WORDS)
    date_hint = any(word in name for word in DATE_WORDS) and not "atualizacao" in name
    period_hint = any(word in name for word in PERIOD_WORDS)
    identifier_hint = any(word in name for word in IDENTIFIER_WORDS)
    description_hint = any(word in name for word in DESCRIPTION_WORDS)
    if percent_hint and numeric >= 0.9:
        return "percent", "high", "header_and_values"
    if money_hint and numeric >= 0.9:
        return "money", "high", "header_and_values"
    if period_hint and periods >= 0.9:
        return "period", "high", "header_and_values"
    if date_hint and dates >= 0.9:
        return "date", "high", "header_and_values"
    if identifier_hint and not money_hint and numeric >= 0.9:
        return "identifier", "high", "header_and_values"
    if identifier_hint and not money_hint and re.search(r"\d", str(valid[0])) and not description_hint:
        return "identifier", "medium", "header_and_values"
    if dates >= 0.98:
        return "date", "medium", "values"
    if periods >= 0.98:
        return "period", "medium", "values"
    if booleans >= 0.98:
        return "boolean", "medium", "values"
    if numeric >= 0.98 and not identifier_hint and not description_hint:
        # Numeric strings with leading zeros are more often identifiers.
        if any(re.fullmatch(r"0\d{2,}", str(value).strip()) for value in valid):
            return "identifier", "medium", "values_leading_zero"
        return ("money" if money_hint else "number"), "medium", "values"
    unique = len({str(value).strip() for value in valid})
    if not description_hint and len(valid) >= 8 and unique <= 20 and (unique <= 5 or unique / len(valid) <= 0.3):
        return "category", "medium", "values_cardinality"
    return "text", "low", "conservative_fallback"


def build_column_schema(
    columns: list[str],
    rows: list[dict[str, Any]],
    overrides: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Construct future-proof, read-only column metadata for any report."""
    overrides = overrides or {}
    sample = _sample_rows(rows or [])
    result = []
    for name in columns or []:
        values = [row.get(name) if isinstance(row, dict) else None for row in sample]
        nonempty = [v for v in values if _not_missing(v)]
        kind, confidence, source = _infer_type(name, values)
        explicit = overrides.get(name) or {}
        if explicit:
            candidate = explicit.get("type", kind)
            if candidate not in FILTERS:
                raise ValueError(f"Tipo de coluna invalido para {name!r}: {candidate!r}")
            kind, confidence, source = candidate, "high", "explicit_override"
        entry = {
            "name": name,
            "type": kind,
            "filter_kind": FILTERS[kind],
            "confidence": confidence,
            "inferred_from": source,
            "sampled_rows": len(sample),
            "nonempty_samples": len(nonempty),
            "missing_samples": len(sample) - len(nonempty),
            "distinct_samples": len({str(v).strip() for v in nonempty}),
            "valid_ratio": round(sum(
                1 for v in nonempty if (
                    (_as_number(v) is not None if kind in {"money", "number", "percent"} else
                     _as_date(v) if kind == "date" else
                     period_metadata(v) is not None if kind == "period" else True)
                )
            ) / len(nonempty), 3) if nonempty else None,
            # An apparent currency amount is not evidence that summation is valid.
            "aggregation": explicit.get("aggregation", "none"),
        }
        if entry["aggregation"] not in {"none", "sum"}:
            raise ValueError(f"Agregacao de coluna invalida para {name!r}")
        if entry["aggregation"] == "sum" and kind not in {"money", "number", "percent"}:
            raise ValueError(f"Soma incompativel com o tipo de {name!r}")
        period = period_metadata(name)
        if period:
            entry["period"] = period
        result.append(entry)
    return result
