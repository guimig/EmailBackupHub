"""Read-only, bounded inspection of historical snapshot content.

Age alone is never evidence that a financial snapshot is disposable.
This audit identifies data-bearing candidates and reconstructibility evidence.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from collections import Counter
from pathlib import Path

import snapshot_retention_audit as retention


def inspect_content(root: Path, today: dt.date, limit: int = 1000) -> dict:
    if limit < 1:
        raise ValueError("limit must be positive")
    with_reference_root = root == retention.ROOT
    if not with_reference_root:
        raise ValueError("Run with the repository root")
    protected = retention.protected_snapshot_paths()
    missing = sorted(p for p in protected if not (root / p).is_file())
    if missing:
        raise RuntimeError(f"Refusing content audit: {len(missing)} referenced snapshots are missing")
    summary = Counter()
    by_report: dict[str, Counter] = {}
    examples: dict[str, list[str]] = {}
    for path in sorted((root / "data" / "snapshots").glob("*/*.json")):
        if summary["inspected"] >= limit:
            break
        rel = path.relative_to(root).as_posix()
        if rel in protected:
            summary["skipped_referenced"] += 1
            continue
        match = retention.DAY_PATTERN.fullmatch(path.name)
        if not match:
            summary["skipped_unrecognized"] += 1
            continue
        try:
            day = dt.date.fromisoformat(match.group(1))
        except ValueError:
            summary["skipped_invalid_date"] += 1
            continue
        if (today - day).days < 365 or day.month == 12 and day.day >= 28 or day.month == 1 and day.day <= 7:
            summary["skipped_protected_date"] += 1
            continue
        summary["inspected"] += 1
        slug = path.parent.name
        stats = by_report.setdefault(slug, Counter())
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(doc, dict):
                raise ValueError("snapshot is not an object")
            rows = doc.get("rows")
            cols = doc.get("columns")
            totals = doc.get("totals")
            if not all(isinstance(x, list) for x in (rows, cols, totals)):
                category = "unknown_schema"
            elif rows or cols or totals:
                category = "contains_financial_data"
            elif "light_snapshot" in (doc.get("quality") or {}).get("issues", []):
                category = "empty_light_snapshot"
            else:
                category = "empty_unclassified"
            source = doc.get("html_path")
            # Source presence does not prove equivalent parsing or full reversibility.
            if isinstance(source, str) and source.startswith("emails/") and (root / source).is_file():
                summary["source_html_present"] += 1
            else:
                summary["source_html_missing_or_invalid"] += 1
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            category = "unreadable"
        summary[category] += 1
        stats[category] += 1
        stats["bytes"] += path.stat().st_size
        if len(examples.setdefault(category, [])) < 5:
            examples[category].append(rel)
    return {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "mode": "read_only_no_deletion", "limit": limit,
            "summary": dict(summary),
            "by_report": {slug: dict(stats) for slug, stats in by_report.items()},
            "examples": examples,
            "warning": "Nonempty files and missing-source files require preservation review; do not delete based on age."}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--output", default="snapshot-content-audit.json")
    args = parser.parse_args()
    result = inspect_content(retention.ROOT, dt.date.today(), args.limit)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
