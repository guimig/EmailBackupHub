"""Experimental table parser for merged Tesouro Gerencial headers.

This module is deliberately not used by data generation yet. It provides a
small, testable surface to compare merged-header behavior before changing the
production parser in data_generator.py.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class ParsedTable:
    columns: list[str]
    rows: list[dict[str, str]]
    header_rows: list[int]
    warnings: list[str]


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def span_int(cell: Any, attr: str) -> int:
    try:
        return max(1, int(cell.get(attr, 1)))
    except (TypeError, ValueError):
        return 1


def expand_table(table: Any) -> list[list[str]]:
    grid: list[list[str]] = []
    carried: dict[int, dict[str, Any]] = {}

    for tr in table.find_all("tr"):
        row: list[str] = []
        col_idx = 0

        def flush_carried() -> None:
            nonlocal col_idx
            while col_idx in carried:
                row.append(carried[col_idx]["text"])
                carried[col_idx]["rows"] -= 1
                if carried[col_idx]["rows"] <= 0:
                    del carried[col_idx]
                col_idx += 1

        flush_carried()
        for cell in tr.find_all(["td", "th"]):
            flush_carried()
            text = clean_text(cell.get_text(" ", strip=True))
            colspan = span_int(cell, "colspan")
            rowspan = span_int(cell, "rowspan")
            for offset in range(colspan):
                row.append(text)
                if rowspan > 1:
                    carried[col_idx + offset] = {"text": text, "rows": rowspan - 1}
            col_idx += colspan
        flush_carried()
        if any(row):
            grid.append(row)

    width = max((len(row) for row in grid), default=0)
    return [row + [""] * (width - len(row)) for row in grid]


def numeric_like(value: str) -> bool:
    value = clean_text(value)
    if not value:
        return False
    cleaned = re.sub(r"[^\d,.-]", "", value)
    return bool(re.fullmatch(r"-?\d+(?:[.,]\d+)*", cleaned))


def header_score(row: list[str]) -> int:
    non_empty = [cell for cell in row if cell]
    if len(non_empty) < 2:
        return 0
    numeric = sum(1 for cell in non_empty if numeric_like(cell))
    words = sum(1 for cell in non_empty if re.search(r"[A-Za-z]", cell))
    terms = sum(
        1
        for cell in non_empty
        if re.search(r"valor|saldo|pago|pagar|conta|natureza|ug|data|mes|r\$", cell, re.I)
    )
    repeated = len(non_empty) - len(set(non_empty))
    return words + terms - numeric - (repeated * 2)


def select_header_rows(grid: list[list[str]], max_scan_rows: int = 12) -> list[int]:
    scored = []
    for idx, row in enumerate(grid[:max_scan_rows]):
        score = header_score(row)
        if score > 0:
            scored.append((idx, score))
    if not scored:
        return []

    best_idx, best_score = max(scored, key=lambda item: (item[1], item[0]))
    selected = [best_idx]
    previous = best_idx - 1
    while previous >= 0 and header_score(grid[previous]) >= max(2, best_score - 2):
        selected.insert(0, previous)
        previous -= 1
    return selected


def dedupe_columns(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result = []
    for idx, column in enumerate(columns, start=1):
        label = clean_text(column) or f"Valor {idx}"
        count = seen.get(label, 0) + 1
        seen[label] = count
        result.append(label if count == 1 else f"{label} {count}")
    return result


def build_columns(grid: list[list[str]], header_rows: list[int]) -> list[str]:
    if not header_rows:
        width = max((len(row) for row in grid), default=0)
        return [f"Valor {idx}" for idx in range(1, width + 1)]

    width = max(len(grid[idx]) for idx in header_rows)
    columns = []
    for col_idx in range(width):
        parts = []
        for row_idx in header_rows:
            value = grid[row_idx][col_idx] if col_idx < len(grid[row_idx]) else ""
            if value and value not in parts:
                parts.append(value)
        columns.append(" - ".join(parts))
    return dedupe_columns(columns)


def parse_html_table(html: str, table_index: int = 0) -> ParsedTable:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        return ParsedTable([], [], [], ["no_table"])
    if table_index >= len(tables):
        return ParsedTable([], [], [], ["table_index_out_of_range"])

    grid = expand_table(tables[table_index])
    header_rows = select_header_rows(grid)
    columns = build_columns(grid, header_rows)
    first_data_row = (max(header_rows) + 1) if header_rows else 0
    rows = []

    for raw_row in grid[first_data_row:]:
        values = raw_row + [""] * (len(columns) - len(raw_row))
        if not any(values):
            continue
        rows.append({column: values[idx] if idx < len(values) else "" for idx, column in enumerate(columns)})

    warnings = []
    if not header_rows:
        warnings.append("header_not_detected")
    if any(column.startswith("Valor ") for column in columns):
        warnings.append("generic_columns")

    return ParsedTable(columns, rows, header_rows, warnings)
