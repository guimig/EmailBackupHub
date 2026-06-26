import datetime
import hashlib
import json
import os
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup

from config import BACKUP_FOLDER, REPO_ROOT, TIMEZONE

DATA_DIR = Path(REPO_ROOT) / "data"
REPORTS_DIR = DATA_DIR / "reports"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
SERIES_DIR = DATA_DIR / "series"
SOURCE_MAP_PATH = DATA_DIR / "source-map.json"
SCHEMA_VERSION = "1.2"


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


def extract_title(soup, file_path):
    title_cell = soup.find("td", attrs={"colspan": "1"})
    if title_cell:
        text = title_cell.get_text(" ", strip=True)
        if text:
            return text
    if soup.title and soup.title.get_text(strip=True):
        return soup.title.get_text(strip=True)
    return os.path.splitext(os.path.basename(file_path))[0]


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


def build_table_grid(table):
    grid = []
    for tr in table.find_all("tr"):
        row = [cell.get_text(" ", strip=True) for cell in tr.find_all(["td", "th"])]
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


def normalize_table(grid):
    if not grid:
        return [], [], [], ["no_table"]
    issues = []
    header_index = next((idx for idx, row in enumerate(grid) if looks_like_header(row)), None)
    if header_index is None:
        width = max(len(row) for row in grid)
        columns = [f"Coluna {idx + 1}" for idx in range(width)]
        data_rows = grid
        issues.append("columns_generated")
    else:
        columns = [cell or f"Coluna {idx + 1}" for idx, cell in enumerate(grid[header_index])]
        data_rows = grid[header_index + 1:]
    width = len(columns)
    rows = []
    totals = []
    for raw_row in data_rows:
        padded = (raw_row + [""] * width)[:width]
        if not any(padded):
            continue
        row = {columns[idx]: padded[idx] for idx in range(width)}
        first_cell = next((cell for cell in padded if cell), "")
        numeric_values = {columns[idx]: parse_br_number(padded[idx]) for idx in range(width) if parse_br_number(padded[idx]) is not None}
        if first_cell.lower().startswith("total"):
            totals.append({"label": first_cell, "values": numeric_values, "raw": row})
        rows.append(row)
        if len(raw_row) != width:
            issues.append("inconsistent_columns")
    if not rows:
        issues.append("no_rows")
    return columns, rows, totals, sorted(set(issues))


def infer_periodicity(title, report_date, now_date):
    normalized = normalize_slug(title).replace("-", " ")
    if re.search(r"\b20\d{2}\b", title or "") and report_date.year < now_date.year:
        return "anual"
    if any(term in normalized for term in ["mensal", " mes ", "mes "]):
        return "mensal"
    return "diaria"


def infer_status(periodicity, age_days):
    limit = {"diaria": 1, "mensal": 35, "anual": 370}.get(periodicity, 1)
    return {"status": "desatualizado" if age_days > limit else "atualizado", "limite_dias": limit}


def extract_exercicio(title, report_date):
    years = [int(year) for year in re.findall(r"\b(20\d{2})\b", title or "")]
    return max(years) if years else report_date.year


def metadata_for(title, report_date, content_hash, source_path, source_map, now, row_count=0, column_count=0):
    age_days = (now.date() - report_date).days
    periodicity = infer_periodicity(title, report_date, now.date())
    return {
        "ultima_atualizacao": now.isoformat(),
        "idade_dias": age_days,
        "periodicidade": periodicity,
        "exercicio": extract_exercicio(title, report_date),
        "fonte_email_uid": source_map.get(source_path),
        "hash_conteudo": content_hash,
        "row_count": row_count,
        "column_count": column_count,
        **infer_status(periodicity, age_days),
    }


def full_report_document(file_path, source_map, now):
    content = Path(file_path).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(content, "html.parser")
    title = extract_title(soup, file_path)
    report_date, date_issue = extract_date(content, file_path)
    slug = normalize_slug(Path(file_path).parent.name or title)
    content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()
    columns, rows, totals, issues = normalize_table(pick_table(soup))
    if date_issue:
        issues.append(date_issue)
    if not soup.find("table"):
        issues.append("no_html_table")
    source_path = rel_path(file_path)
    return {
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
        "metadata": metadata_for(title, report_date, content_hash, source_path, source_map, now, len(rows), len(columns)),
        "quality": {"ok": not issues, "issues": sorted(set(issues))},
    }


def light_history_document(file_path, title, slug, source_map, now):
    report_date, date_issue = parse_date_from_name(file_path)
    source_path = rel_path(file_path)
    issues = [date_issue, "light_snapshot"] if date_issue else ["light_snapshot"]
    return {
        "schema_version": SCHEMA_VERSION,
        "slug": slug,
        "title": title,
        "date": report_date.strftime("%d/%m/%Y"),
        "date_iso": report_date.isoformat(),
        "html_path": source_path,
        "category": title,
        "columns": [],
        "rows": [],
        "totals": [],
        "metadata": metadata_for(title, report_date, cheap_hash(file_path), source_path, source_map, now),
        "quality": {"ok": False, "issues": issues},
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


def build_search_text(doc):
    parts = [doc["title"], doc["date"], doc["html_path"], " ".join(doc["columns"])]
    for row in doc["rows"]:
        parts.append(" ".join(str(value) for value in row.values()))
    return " ".join(parts)


def build_series(slug, snapshots):
    return {
        "schema_version": SCHEMA_VERSION,
        "slug": slug,
        "series": [
            {"date": doc["date"], "date_iso": doc["date_iso"], "hash_conteudo": doc["metadata"]["hash_conteudo"], "totals": []}
            for doc in sorted(snapshots, key=lambda item: item["date_iso"])
        ],
    }


def generate_data_files():
    now = datetime.datetime.now(TIMEZONE)
    source_map = read_json(SOURCE_MAP_PATH, {})
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    reports = []
    search_documents = []
    history_count = 0
    for slug, paths in sorted(grouped_files().items()):
        paths = sorted(paths, key=sort_key)
        latest_path = paths[-1]
        latest_doc = full_report_document(latest_path, source_map, now)
        write_json(REPORTS_DIR / f"{slug}.json", latest_doc)
        search_documents.append({"slug": slug, "title": latest_doc["title"], "date": latest_doc["date"], "date_iso": latest_doc["date_iso"], "html_path": latest_doc["html_path"], "json_path": f"data/reports/{slug}.json", "text": build_search_text(latest_doc)})
        snapshots = []
        for path in paths:
            doc = latest_doc if path == latest_path else light_history_document(path, latest_doc["title"], slug, source_map, now)
            snapshots.append(doc)
            snapshot_name = f"{doc['date_iso']}-{doc['metadata']['hash_conteudo'][:12]}.json"
            write_json(SNAPSHOTS_DIR / slug / snapshot_name, doc)
        write_json(SERIES_DIR / f"{slug}.json", build_series(slug, snapshots))
        history_count += len(snapshots)
        report_path = REPORTS_DIR / f"{slug}.json"
        reports.append({"slug": slug, "title": latest_doc["title"], "date": latest_doc["date"], "date_iso": latest_doc["date_iso"], "html_path": latest_doc["html_path"], "json_path": rel_path(report_path), "series_path": rel_path(SERIES_DIR / f"{slug}.json"), "viewer_path": f"report-viewer.html?report={rel_path(report_path)}", "metadata": latest_doc["metadata"], "quality": latest_doc["quality"]})
    write_json(DATA_DIR / "index.json", {"schema_version": SCHEMA_VERSION, "generated_at": now.isoformat(), "api": {"reports": "data/reports/<slug>.json", "snapshots": "data/snapshots/<slug>/<date>-<hash>.json", "series": "data/series/<slug>.json", "search": "data/search-index.json"}, "reports": reports, "history_count": history_count})
    write_json(DATA_DIR / "search-index.json", {"schema_version": SCHEMA_VERSION, "generated_at": now.isoformat(), "documents": search_documents})
    print(f"API estatica atualizada: {len(reports)} relatorios, {history_count} versoes historicas.")
