import datetime
import hashlib
import json
import os
import re
import time
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup

from config import BACKUP_FOLDER, REPO_ROOT, TIMEZONE
from report_definitions import (
    REPORT_DEFINITIONS,
    report_columns,
    report_definition,
    report_expected_metrics,
    report_limit_days,
    report_metric_rules,
    report_periodicity,
    report_status,
    report_title,
)

DATA_DIR = Path(REPO_ROOT) / "data"
REPORTS_DIR = DATA_DIR / "reports"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
SERIES_DIR = DATA_DIR / "series"
SOURCE_MAP_PATH = DATA_DIR / "source-map.json"
CACHE_INDEX_PATH = DATA_DIR / "cache-index.json"
RETENTION_PLAN_PATH = DATA_DIR / "retention-plan.json"
REPORT_DEFINITIONS_PATH = DATA_DIR / "report-definitions.json"
SCHEMA_VERSION = "1.5"
RETENTION_DRY_RUN = True
SERIES_MIN_DATE = datetime.date(2026, 1, 1)

INFO_QUALITY_CODES = {
    "date_from_filename",
    "date_from_mtime",
    "inconsistent_columns",
    "totals_separated",
}

def normalize_slug(text):
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "-", text).strip("-")
    text = re.sub(r"-+", "-", text)
    return text or "sem-titulo"


def read_json(path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return default


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_report_definitions(now):
    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now.isoformat(),
        "reports": REPORT_DEFINITIONS,
    }
    write_json(REPORT_DEFINITIONS_PATH, payload)
    return REPORT_DEFINITIONS_PATH


def elapsed_seconds(started_at):
    return round(max(0, time.monotonic() - started_at), 3)


def rel_path(path):
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def record_source_uid(file_path, source_uid):
    if not source_uid:
        return
    source_map = read_json(SOURCE_MAP_PATH, {})
    source_map[rel_path(file_path)] = str(source_uid)
    write_json(SOURCE_MAP_PATH, source_map)


def parse_date_from_name(path):
    match = re.search(r"(\d{2}-\d{2}-\d{4})", os.path.basename(path))
    if match:
        return datetime.datetime.strptime(match.group(1), "%d-%m-%Y").date(), "date_from_filename"
    return datetime.datetime.fromtimestamp(os.path.getmtime(path)).date(), "date_from_mtime"


def extract_date(content, file_path):
    match = re.search(r"Relat[óo]rio gerado em:\s*(\d{2}/\d{2}/\d{4})", content, re.IGNORECASE)
    if match:
        return datetime.datetime.strptime(match.group(1), "%d/%m/%Y").date(), None
    return parse_date_from_name(file_path)


def cheap_hash(path):
    stat = os.stat(path)
    raw = f"{rel_path(path)}:{stat.st_size}:{int(stat.st_mtime)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def content_hash_for_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_title(soup, file_path):
    title_cell = soup.find("td", attrs={"colspan": "1"})
    if title_cell:
        text = title_cell.get_text(" ", strip=True)
        if text:
            return text
    if soup.title and soup.title.get_text(strip=True):
        return soup.title.get_text(strip=True)
    return os.path.splitext(os.path.basename(file_path))[0]


def apply_report_overrides(slug, title):
    return report_title(slug, title) or title


def parse_br_number(value):
    value = (value or "").strip()
    if not value:
        return None
    negative = value.startswith("(") and value.endswith(")")
    value = re.sub(r"[^\d,.-]", "", value.strip("()"))
    if not value:
        return None
    if "," in value:
        value = value.replace(".", "").replace(",", ".")
    try:
        number = float(value)
    except ValueError:
        return None
    return -number if negative else number


def normalize_key(text):
    return normalize_slug(text).replace("-", " ")


def span_value(cell, attr):
    try:
        return max(1, int(cell.get(attr, 1)))
    except (TypeError, ValueError):
        return 1


def build_table_grid(table):
    grid = []
    carried = {}
    for tr in table.find_all("tr"):
        row = []
        col_idx = 0
        while col_idx in carried:
            row.append(carried[col_idx]["text"])
            carried[col_idx]["rows"] -= 1
            if carried[col_idx]["rows"] <= 0:
                del carried[col_idx]
            col_idx += 1
        for cell in tr.find_all(["td", "th"]):
            while col_idx in carried:
                row.append(carried[col_idx]["text"])
                carried[col_idx]["rows"] -= 1
                if carried[col_idx]["rows"] <= 0:
                    del carried[col_idx]
                col_idx += 1
            text = cell.get_text(" ", strip=True)
            colspan = span_value(cell, "colspan")
            rowspan = span_value(cell, "rowspan")
            for offset in range(colspan):
                row.append(text)
                if rowspan > 1:
                    carried[col_idx + offset] = {"text": text, "rows": rowspan - 1}
            col_idx += colspan
        while col_idx in carried:
            row.append(carried[col_idx]["text"])
            carried[col_idx]["rows"] -= 1
            if carried[col_idx]["rows"] <= 0:
                del carried[col_idx]
            col_idx += 1
        if any(row):
            grid.append(row)
    return grid


def pick_table(soup):
    tables = [build_table_grid(table) for table in soup.find_all("table")]
    tables = [table for table in tables if table]
    return max(tables, key=lambda table: sum(len(row) for row in table)) if tables else []


def looks_like_header(row):
    if len(row) < 2:
        return False
    text_cells = [cell for cell in row if cell and parse_br_number(cell) is None]
    return len(text_cells) >= max(2, len(row) // 2)


def looks_like_data(row):
    cells = [cell for cell in row if cell]
    if len(cells) < 2:
        return False
    numeric_count = sum(1 for cell in cells if parse_br_number(cell) is not None)
    return numeric_count >= max(1, len(cells) // 3)


def dedupe_columns(columns):
    seen = {}
    result = []
    for idx, column in enumerate(columns):
        name = re.sub(r"\s+", " ", column or "").strip() or f"Coluna {idx + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        result.append(name)
    return result


def has_generated_column_names(columns):
    return bool(columns) and all(re.fullmatch(r"Coluna \d+", column or "") for column in columns)


def apply_column_overrides(slug, columns):
    friendly = report_columns(slug)
    if not friendly or not has_generated_column_names(columns):
        return columns
    result = []
    for idx, column in enumerate(columns):
        result.append(friendly[idx] if idx < len(friendly) else f"Valor {idx + 1}")
    return dedupe_columns(result)


def rename_row_keys(row, old_columns, new_columns):
    return {
        new_columns[idx]: row.get(old_columns[idx], "")
        for idx in range(min(len(old_columns), len(new_columns)))
    }


def apply_column_names_to_data(slug, columns, rows, totals, row_types):
    new_columns = apply_column_overrides(slug, columns)
    if new_columns == columns:
        return columns, rows, totals, row_types
    new_rows = [rename_row_keys(row, columns, new_columns) for row in rows]
    new_totals = []
    for total in totals:
        raw = rename_row_keys(total.get("raw", {}), columns, new_columns)
        values = {
            new_columns[idx]: total.get("values", {}).get(columns[idx])
            for idx in range(min(len(columns), len(new_columns)))
            if total.get("values", {}).get(columns[idx]) is not None
        }
        new_totals.append({**total, "values": values, "raw": raw})
    new_row_types = [
        {**item, "raw": rename_row_keys(item.get("raw", {}), columns, new_columns)}
        for item in row_types
    ]
    return new_columns, new_rows, new_totals, new_row_types


def merge_header_rows(header_rows, width):
    columns = []
    for col_idx in range(width):
        parts = []
        for row in header_rows:
            value = row[col_idx] if col_idx < len(row) else ""
            if value and value not in parts:
                parts.append(value)
        columns.append(" / ".join(parts) or f"Coluna {col_idx + 1}")
    return dedupe_columns(columns)


def classify_row(row):
    joined = normalize_slug(" ".join(cell for cell in row if cell)).replace("-", " ")
    first_cell = next((cell for cell in row if cell), "")
    first_slug = normalize_slug(first_cell).replace("-", " ")
    numeric_count = sum(1 for cell in row if parse_br_number(cell) is not None)
    if re.search(r"\b(total|subtotal|sub total|totalizador|soma)\b", first_slug):
        return "total"
    if numeric_count and re.search(r"\b(total|subtotal|sub total|totalizador|soma)\b", joined):
        return "total"
    return "data"


def quality_result(codes):
    codes = sorted(set(code for code in codes if code))
    issues = [code for code in codes if code not in INFO_QUALITY_CODES]
    warnings = [code for code in codes if code in INFO_QUALITY_CODES]
    return {"ok": not issues, "issues": issues, "warnings": warnings}


def normalize_table(grid):
    if not grid:
        return [], [], [], [], ["no_table"]
    issues = []
    data_start = next((idx for idx, row in enumerate(grid) if looks_like_data(row)), None)
    if data_start is None:
        width = max(len(row) for row in grid)
        columns = [f"Coluna {idx + 1}" for idx in range(width)]
        data_rows = grid
        issues.append("columns_generated")
    else:
        header_candidates = [row for row in grid[:data_start] if looks_like_header(row)]
        width = max(len(row) for row in grid[data_start:] + header_candidates)
        fallback_headers = [grid[data_start - 1]] if data_start > 0 else []
        columns = merge_header_rows(header_candidates[-3:] or fallback_headers, width)
        data_rows = grid[data_start:]
    width = len(columns)
    rows = []
    totals = []
    row_types = []
    for raw_row in data_rows:
        padded = (raw_row + [""] * width)[:width]
        if not any(padded):
            continue
        row = {columns[idx]: padded[idx] for idx in range(width)}
        numeric_values = {columns[idx]: parse_br_number(padded[idx]) for idx in range(width) if parse_br_number(padded[idx]) is not None}
        row_type = classify_row(padded)
        if row_type == "total":
            label = next((cell for cell in padded if cell), "Total")
            totals.append({"label": label, "values": numeric_values, "raw": row})
        else:
            rows.append(row)
        row_types.append({"type": row_type, "raw": row})
        if len(raw_row) != width:
            issues.append("inconsistent_columns")
    if not rows:
        issues.append("no_rows")
    if totals:
        issues.append("totals_separated")
    return columns, rows, totals, row_types, sorted(set(issues))


def infer_periodicity(slug, title, report_date, now_date):
    periodicity = report_periodicity(slug)
    if periodicity:
        return periodicity
    normalized = normalize_slug(title).replace("-", " ")
    if re.search(r"\b20\d{2}\b", title or "") and report_date.year < now_date.year:
        return "historico"
    if any(term in normalized for term in ["mensal", " mes ", "mes "]):
        return "mensal"
    return "diaria"


def infer_status(slug, periodicity, age_days, now_date):
    definition = report_definition(slug)
    status = report_status(slug)
    if status:
        return {"status": status, "limite_dias": report_limit_days(slug)}
    if definition.get("limite_dias") is None and "limite_dias" in definition:
        return {"status": "atualizado", "limite_dias": None}
    configured_limit = report_limit_days(slug)
    limit = configured_limit if "limite_dias" in definition else {"diaria": 1, "mensal": 35, "historico": None, "anual": 370}.get(periodicity, 1)
    if periodicity == "diaria" and now_date.weekday() == 0 and limit is not None:
        limit = max(limit, 2)
    if limit is None:
        return {"status": "atualizado", "limite_dias": None}
    return {"status": "desatualizado" if age_days > limit else "atualizado", "limite_dias": limit}


def extract_exercicio(title, report_date):
    years = [int(year) for year in re.findall(r"\b(20\d{2})\b", title or "")]
    return max(years) if years else report_date.year


def metadata_for(slug, title, report_date, content_hash, source_path, source_map, now, row_count=0, column_count=0):
    age_days = (now.date() - report_date).days
    periodicity = infer_periodicity(slug, title, report_date, now.date())
    return {
        "ultima_atualizacao": now.isoformat(),
        "idade_dias": age_days,
        "periodicidade": periodicity,
        "exercicio": extract_exercicio(title, report_date),
        "fonte_email_uid": source_map.get(source_path),
        "hash_conteudo": content_hash,
        "row_count": row_count,
        "column_count": column_count,
        **infer_status(slug, periodicity, age_days, now.date()),
    }


def full_report_document(file_path, source_map, now):
    content = Path(file_path).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(content, "html.parser")
    slug = normalize_slug(Path(file_path).parent.name)
    title = apply_report_overrides(slug, extract_title(soup, file_path))
    report_date, date_issue = extract_date(content, file_path)
    content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()
    columns, rows, totals, row_types, issues = normalize_table(pick_table(soup))
    columns, rows, totals, row_types = apply_column_names_to_data(slug, columns, rows, totals, row_types)
    if date_issue:
        issues.append(date_issue)
    if not soup.find("table"):
        issues.append("no_html_table")
    source_path = rel_path(file_path)
    doc = {
        "schema_version": SCHEMA_VERSION,
        "slug": slug,
        "title": title,
        "date": report_date.strftime("%d/%m/%Y"),
        "date_iso": report_date.isoformat(),
        "html_path": source_path,
        "category": title,
        "columns": columns,
        "rows": rows,
        "totals": totals,
        "row_types": row_types,
        "metadata": metadata_for(slug, title, report_date, content_hash, source_path, source_map, now, len(rows), len(columns)),
        "quality": quality_result(issues),
    }
    return annotate_metrics(doc)


def light_history_document(file_path, title, slug, source_map, now):
    report_date, date_issue = parse_date_from_name(file_path)
    source_path = rel_path(file_path)
    issues = [date_issue, "light_snapshot"] if date_issue else ["light_snapshot"]
    return {
        "schema_version": SCHEMA_VERSION,
        "slug": slug,
        "title": apply_report_overrides(slug, title),
        "date": report_date.strftime("%d/%m/%Y"),
        "date_iso": report_date.isoformat(),
        "html_path": source_path,
        "category": apply_report_overrides(slug, title),
        "columns": [],
        "rows": [],
        "totals": [],
        "row_types": [],
        "metadata": metadata_for(slug, apply_report_overrides(slug, title), report_date, cheap_hash(file_path), source_path, source_map, now),
        "quality": quality_result(issues),
    }


def grouped_files():
    backup_root = Path(REPO_ROOT) / BACKUP_FOLDER
    groups = {}
    if not backup_root.exists():
        return groups
    for file_path in backup_root.rglob("*.html"):
        slug = normalize_slug(file_path.parent.name)
        groups.setdefault(slug, []).append(str(file_path))
    return groups


def sort_key(file_path):
    report_date, _ = parse_date_from_name(file_path)
    return report_date.isoformat(), os.path.getmtime(file_path)


def first_business_day(year, month):
    day = datetime.date(year, month, 1)
    while day.weekday() >= 5:
        day += datetime.timedelta(days=1)
    return day


def closing_date_for_report(report_date):
    return report_date - datetime.timedelta(days=1)


def monthly_close_key(report_date):
    closing_date = closing_date_for_report(report_date)
    return f"{closing_date.year:04d}-{closing_date.month:02d}"


def is_monthly_close_report(report_date):
    return report_date == first_business_day(report_date.year, report_date.month)


def dated_file_info(file_path):
    report_date, _ = parse_date_from_name(file_path)
    closing_date = closing_date_for_report(report_date)
    return {
        "path": file_path,
        "date": report_date,
        "closing_date": closing_date,
        "monthly_close_for": monthly_close_key(report_date) if is_monthly_close_report(report_date) else None,
    }


def retention_selection(paths):
    dated_files = sorted((dated_file_info(path) for path in paths), key=lambda item: (item["date"].isoformat(), os.path.getmtime(item["path"])))
    if not dated_files:
        return [], []

    latest = dated_files[-1]
    latest_path = latest["path"]
    selected = {}
    reasons = {}

    def keep(item, reason):
        selected[item["path"]] = item
        reasons.setdefault(item["path"], set()).add(reason)

    keep(latest, "latest")
    for item in dated_files:
        date = item["date"]
        if is_monthly_close_report(date):
            keep(item, "monthly_close")

    retained = []
    ignored = []
    for item in dated_files:
        path = item["path"]
        if path in selected:
            retained.append({**item, "reasons": sorted(reasons[path])})
        else:
            ignored.append(item)
    return retained, ignored


def refresh_document_metadata(doc, source_map, now):
    if not doc:
        return doc
    try:
        report_date = datetime.date.fromisoformat(doc["date_iso"])
    except (KeyError, ValueError):
        return doc
    source_path = doc.get("html_path", "")
    title = doc.get("title") or doc.get("category") or doc.get("slug") or ""
    content_hash = (doc.get("metadata") or {}).get("hash_conteudo") or ""
    doc["metadata"] = metadata_for(
        doc.get("slug") or normalize_slug(Path(source_path).parent.name),
        title,
        report_date,
        content_hash,
        source_path,
        source_map,
        now,
        len(doc.get("rows") or []),
        len(doc.get("columns") or []),
    )
    return doc


def cached_document(file_path, source_map, now, cache_index, stats):
    source_path = rel_path(file_path)
    content_hash = content_hash_for_file(file_path)
    entry = cache_index.get(source_path) or {}
    snapshot_path = Path(REPO_ROOT) / entry.get("snapshot_path", "")
    stats["cache_lookups"] += 1
    if entry.get("content_hash") == content_hash and snapshot_path.exists():
        doc = read_json(snapshot_path, None)
        if doc:
            stats["cache_hits"] += 1
            return annotate_metrics(refresh_document_metadata(doc, source_map, now)), content_hash

    if entry.get("content_hash") == content_hash and not snapshot_path.exists():
        stats["cache_misses_missing_snapshot"] += 1
    elif entry:
        stats["cache_misses_changed"] += 1
    else:
        stats["cache_misses_new"] += 1

    stats["processed_files"] += 1
    doc = full_report_document(file_path, source_map, now)
    return doc, content_hash


def processing_delta(before, after, started_at):
    keys = [
        "cache_lookups",
        "cache_hits",
        "cache_misses_new",
        "cache_misses_changed",
        "cache_misses_missing_snapshot",
        "processed_files",
        "snapshots_written",
    ]
    result = {key: after.get(key, 0) - before.get(key, 0) for key in keys}
    result["duration_seconds"] = elapsed_seconds(started_at)
    return result


def retention_plan_item(slug, retained, ignored):
    def plan_entry(item, include_reasons=False):
        entry = {
            "path": rel_path(item["path"]),
            "date_iso": item["date"].isoformat(),
            "closing_date_iso": item["closing_date"].isoformat(),
        }
        if item.get("monthly_close_for"):
            entry["monthly_close_for"] = item["monthly_close_for"]
        if include_reasons:
            entry["reasons"] = item["reasons"]
        return entry

    return {
        "slug": slug,
        "total_files": len(retained) + len(ignored),
        "retained_files": len(retained),
        "ignored_by_retention": len(ignored),
        "latest_files": sum(1 for item in retained if "latest" in item["reasons"]),
        "monthly_close_files": sum(1 for item in retained if "monthly_close" in item["reasons"]),
        "retained": [plan_entry(item, include_reasons=True) for item in retained],
        "removal_candidates_sample": [plan_entry(item) for item in ignored[:50]],
    }


def build_search_text(doc):
    parts = [doc["title"], doc["date"], doc["html_path"], " ".join(doc["columns"])]
    for row in doc["rows"]:
        parts.append(" ".join(str(value) for value in row.values()))
    return " ".join(parts)


def metric_column_candidates(rule):
    columns = []
    for key in ("columns", "fallback_columns"):
        for column in rule.get(key) or []:
            if column and column not in columns:
                columns.append(column)
    return columns


def descriptive_column_match(column, candidate):
    normalized_column = normalize_key(column)
    normalized_candidate = normalize_key(candidate)
    if not normalized_column or not normalized_candidate:
        return False
    if normalized_column == normalized_candidate:
        return True
    if len(normalized_candidate) < 8:
        return False
    return normalized_candidate in normalized_column


def matches_metric_terms(column, rule):
    normalized_column = normalize_key(column)
    match_terms = [normalize_key(term) for term in rule.get("match_terms") or []]
    return bool(match_terms) and all(term in normalized_column for term in match_terms)


def matches_metric_column(column, rule):
    return any(descriptive_column_match(column, candidate) for candidate in metric_column_candidates(rule)) or matches_metric_terms(column, rule)


def metric_columns(columns, rule):
    result = []

    def add(column):
        if column not in result:
            result.append(column)

    for candidate in metric_column_candidates(rule):
        for column in columns:
            if normalize_key(column) == normalize_key(candidate):
                add(column)
    for candidate in metric_column_candidates(rule):
        for column in columns:
            if descriptive_column_match(column, candidate):
                add(column)
    for column in columns:
        if matches_metric_terms(column, rule):
            add(column)
    return result


def metric_value_from_totals(totals, columns, rule):
    for column in metric_columns(columns, rule):
        for total in reversed(totals or []):
            values = total.get("values") or {}
            if column in values and values[column] is not None:
                return values[column]
            raw = total.get("raw") or {}
            value = parse_br_number(raw.get(column))
            if value is not None:
                return value
    return None


def metric_value_from_rows(rows, columns, rule):
    for column in metric_columns(columns, rule):
        values = [parse_br_number(row.get(column)) for row in rows or []]
        values = [value for value in values if value is not None]
        if values:
            return sum(values)
    return None


def total_label_text(total, columns):
    raw = total.get("raw") or {}
    candidates = [total.get("label"), raw.get(columns[0]) if columns else None]
    return normalize_key(" ".join(str(value or "") for value in candidates))


def safe_total_rows(totals, columns):
    return [
        total
        for total in totals or []
        if "total" in total_label_text(total, columns)
    ]


def rap_metric_from_totals(doc, metric, rule):
    columns = doc.get("columns") or []
    totals = safe_total_rows(doc.get("totals"), columns)
    if not totals:
        return None, {
            "status": "unavailable",
            "reason": "Linha de total geral de RAP nao encontrada.",
            "source": "data/reports",
            "fallback": False,
        }
    for column in metric_columns(columns, rule):
        for total in reversed(totals):
            values = total.get("values") or {}
            raw = total.get("raw") or {}
            value = values.get(column)
            if value is None:
                value = parse_br_number(raw.get(column))
            if value is None:
                continue
            if abs(value) < 100:
                return None, {
                    "status": "invalid",
                    "reason": f"Valor de RAP com magnitude suspeita: {value}.",
                    "source": "data/reports",
                    "line": total.get("label") or "total",
                    "column": column,
                    "fallback": bool(re.fullmatch(r"Valor\s+\d+", column or "", re.IGNORECASE)),
                }
            return value, {
                "status": "ok",
                "source": "data/reports",
                "line": total.get("label") or "total",
                "column": column,
                "fallback": bool(re.fullmatch(r"Valor\s+\d+", column or "", re.IGNORECASE)),
            }
    return None, {
        "status": "unavailable",
        "reason": f"Coluna esperada para {metric} nao encontrada na linha de total de RAP.",
        "source": "data/reports",
        "fallback": False,
    }


def extract_rap_metrics(doc, rules):
    metrics = {}
    meta = {}
    issues = set()
    for metric in report_expected_metrics(doc.get("slug")):
        rule = rules.get(metric)
        if not rule:
            continue
        value, metric_meta = rap_metric_from_totals(doc, metric, rule)
        meta[metric] = metric_meta
        if value is not None:
            metrics[metric] = value
        else:
            issues.add("rap_metric_unavailable" if metric_meta.get("status") == "unavailable" else "rap_metric_invalid")
    if "rap_pago" in metrics and "rap_a_pagar" in metrics:
        total = metrics["rap_pago"] + metrics["rap_a_pagar"]
        if total <= 0:
            issues.add("rap_metric_invalid")
        elif metrics["rap_pago"] < 0 or metrics["rap_a_pagar"] < 0:
            issues.add("rap_metric_invalid")
    return metrics, meta, sorted(issues)


def extract_metrics_with_meta(doc):
    slug = doc.get("slug")
    rules = report_metric_rules(slug)
    metrics = {}
    meta = {}
    issues = []
    if slug == "restos-a-pagar-rap":
        return extract_rap_metrics(doc, rules)
    for metric in report_expected_metrics(slug):
        rule = rules.get(metric)
        if not rule:
            continue
        value = metric_value_from_totals(doc.get("totals"), doc.get("columns") or [], rule)
        source = "totals"
        if value is None:
            value = metric_value_from_rows(doc.get("rows"), doc.get("columns") or [], rule)
            source = "rows_sum"
        if value is not None:
            metrics[metric] = value
            meta[metric] = {"status": "ok", "source": source, "fallback": False}
    return metrics, meta, issues


def extract_metrics(doc):
    metrics, _, _ = extract_metrics_with_meta(doc)
    return metrics


def annotate_metrics(doc):
    metrics, meta, issues = extract_metrics_with_meta(doc)
    doc["metrics"] = metrics
    doc["metrics_meta"] = meta
    if issues:
        quality = doc.setdefault("quality", {"ok": True, "issues": [], "warnings": []})
        quality["issues"] = sorted(set((quality.get("issues") or []) + issues))
        quality["ok"] = not quality["issues"]
    return doc


def series_item(doc):
    metrics, meta, issues = extract_metrics_with_meta(doc)
    item = {
        "date": doc["date"],
        "date_iso": doc["date_iso"],
        "hash_conteudo": doc["metadata"]["hash_conteudo"],
        "totals": doc.get("totals") or [],
    }
    item["metrics"] = metrics
    if meta:
        item["metrics_meta"] = meta
    if issues:
        item["metrics_quality"] = {"ok": False, "issues": issues}
    return item


def build_series(slug, snapshots):
    ordered = sorted(snapshots, key=lambda item: item["date_iso"])
    filtered = [
        doc
        for doc in ordered
        if datetime.date.fromisoformat(doc["date_iso"]) >= SERIES_MIN_DATE
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "slug": slug,
        "series_min_date": SERIES_MIN_DATE.isoformat(),
        "omitted_before_min_date": len(ordered) - len(filtered),
        "series": [series_item(doc) for doc in filtered],
    }


def generate_data_files():
    generation_started = time.monotonic()
    now = datetime.datetime.now(TIMEZONE)
    source_map = read_json(SOURCE_MAP_PATH, {})
    cache_index = read_json(CACHE_INDEX_PATH, {})
    new_cache_index = dict(cache_index)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    reports = []
    search_documents = []
    history_count = 0
    json_files = []
    retention_items = []
    retention_summary = {
        "dry_run": RETENTION_DRY_RUN,
        "total_files": 0,
        "retained_files": 0,
        "ignored_by_retention": 0,
        "removal_candidates": 0,
        "latest_files": 0,
        "monthly_close_files": 0,
        "cache_lookups": 0,
        "processed_files": 0,
        "cache_hits": 0,
        "cache_misses_new": 0,
        "cache_misses_changed": 0,
        "cache_misses_missing_snapshot": 0,
        "snapshots_written": 0,
    }
    for slug, paths in sorted(grouped_files().items()):
        report_started = time.monotonic()
        paths = sorted(paths, key=sort_key)
        retained_paths, ignored_paths = retention_selection(paths)
        retention_item = retention_plan_item(slug, retained_paths, ignored_paths)
        retention_summary["total_files"] += len(paths)
        retention_summary["retained_files"] += len(retained_paths)
        retention_summary["ignored_by_retention"] += len(ignored_paths)
        retention_summary["removal_candidates"] += len(ignored_paths)
        retention_summary["latest_files"] += sum(1 for item in retained_paths if "latest" in item["reasons"])
        retention_summary["monthly_close_files"] += sum(1 for item in retained_paths if "monthly_close" in item["reasons"])
        if not retained_paths:
            retention_item["processing"] = processing_delta(retention_summary, retention_summary, report_started)
            retention_items.append(retention_item)
            continue
        before_report = dict(retention_summary)
        latest_path = paths[-1]
        retained_lookup = {item["path"] for item in retained_paths}
        if latest_path not in retained_lookup:
            latest_path = retained_paths[-1]["path"]
        latest_doc, latest_hash = cached_document(latest_path, source_map, now, new_cache_index, retention_summary)
        report_json_path = REPORTS_DIR / f"{slug}.json"
        write_json(report_json_path, latest_doc)
        json_files.append(rel_path(report_json_path))
        search_documents.append({"slug": slug, "title": latest_doc["title"], "date": latest_doc["date"], "date_iso": latest_doc["date_iso"], "html_path": latest_doc["html_path"], "json_path": f"data/reports/{slug}.json", "text": build_search_text(latest_doc)})
        snapshots = []
        for item in retained_paths:
            path = item["path"]
            if path == latest_path:
                doc, content_hash = latest_doc, latest_hash
            else:
                doc, content_hash = cached_document(path, source_map, now, new_cache_index, retention_summary)
            snapshots.append(doc)
            snapshot_name = f"{doc['date_iso']}-{doc['metadata']['hash_conteudo'][:12]}.json"
            snapshot_path = SNAPSHOTS_DIR / slug / snapshot_name
            write_json(snapshot_path, doc)
            new_cache_index[rel_path(path)] = {
                "content_hash": content_hash,
                "snapshot_path": rel_path(snapshot_path),
                "date_iso": doc["date_iso"],
                "slug": slug,
                "updated_at": now.isoformat(),
            }
            json_files.append(rel_path(snapshot_path))
            retention_summary["snapshots_written"] += 1
        series_path = SERIES_DIR / f"{slug}.json"
        write_json(series_path, build_series(slug, snapshots))
        json_files.append(rel_path(series_path))
        history_count += len(snapshots)
        reports.append({"slug": slug, "title": latest_doc["title"], "date": latest_doc["date"], "date_iso": latest_doc["date_iso"], "html_path": latest_doc["html_path"], "json_path": rel_path(report_json_path), "series_path": rel_path(series_path), "viewer_path": f"report-viewer.html?report={rel_path(report_json_path)}", "metadata": latest_doc["metadata"], "quality": latest_doc["quality"]})
        retention_item["processing"] = processing_delta(before_report, retention_summary, report_started)
        retention_items.append(retention_item)
    index_path = DATA_DIR / "index.json"
    search_index_path = DATA_DIR / "search-index.json"
    cache_index_path = CACHE_INDEX_PATH
    retention_plan_path = RETENTION_PLAN_PATH
    report_definitions_path = write_report_definitions(now)
    write_json(index_path, {"schema_version": SCHEMA_VERSION, "generated_at": now.isoformat(), "api": {"reports": "data/reports/<slug>.json", "snapshots": "data/snapshots/<slug>/<date>-<hash>.json", "series": "data/series/<slug>.json", "search": "data/search-index.json", "definitions": "data/report-definitions.json"}, "reports": reports, "history_count": history_count})
    write_json(search_index_path, {"schema_version": SCHEMA_VERSION, "generated_at": now.isoformat(), "documents": search_documents})
    write_json(cache_index_path, new_cache_index)
    retention_summary["duration_seconds"] = elapsed_seconds(generation_started)
    write_json(retention_plan_path, {"schema_version": SCHEMA_VERSION, "generated_at": now.isoformat(), "policy": {"dry_run": RETENTION_DRY_RUN, "keep_latest": True, "keep_monthly_close": True, "monthly_close_source": "first_business_day_of_month", "closing_date_rule": "report_date_minus_one_day"}, "summary": retention_summary, "reports": retention_items})
    json_files.extend([rel_path(index_path), rel_path(search_index_path), rel_path(cache_index_path), rel_path(retention_plan_path), rel_path(report_definitions_path)])
    print(f"API estatica atualizada: {len(reports)} relatorios, {history_count} versoes historicas preservadas.")
    print(f"Retencao: {retention_summary['retained_files']} preservados, {retention_summary['ignored_by_retention']} ignorados; cache: {retention_summary['cache_hits']} reaproveitados, {retention_summary['processed_files']} processados.")
    return {
        "generated_at": now.isoformat(),
        "reports_count": len(reports),
        "history_count": history_count,
        "updated_reports": [report["slug"] for report in reports],
        "retention": retention_summary,
        "json_files": sorted(set(json_files)),
    }
