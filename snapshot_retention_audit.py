"""Audit historical JSON snapshots without touching the production dataset.

Read-only by design: no deletion option is exposed.
Old unreferenced snapshots are review candidates, not proven disposable.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SNAPSHOTS = ROOT / "data" / "snapshots"
DEFAULT_AUDIT = ROOT / "data" / "snapshot-retention-audit.json"
DAY_PATTERN = re.compile(r"^(\d{4}-\d{2}-\d{2})-[0-9a-f]{12}\.json$")


def read_json(path: Path, default):
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def protected_snapshot_paths() -> set[str]:
    protected = set()
    cache = read_json(ROOT / "data" / "cache-index.json", {})
    if not isinstance(cache, dict):
        raise ValueError("Invalid cache-index.json")
    for entry in cache.values():
        if isinstance(entry, dict):
            path = entry.get("snapshot_path")
            if isinstance(path, str) and path.startswith("data/snapshots/"):
                protected.add(path)
    plan = read_json(ROOT / "data" / "retention-plan.json", {})
    if not isinstance(plan, dict):
        raise ValueError("Invalid retention-plan.json")
    # All snapshots sharing the hash of a retained HTML are protected via cache.
    for report in plan.get("reports", []):
        for item in report.get("retained", []):
            source = item.get("path")
            if isinstance(source, str):
                entry = cache.get(source, {})
                if isinstance(entry, dict) and entry.get("snapshot_path"):
                    protected.add(entry["snapshot_path"])
    index = read_json(ROOT / "data" / "index.json", {})
    if not isinstance(index, dict):
        raise ValueError("Invalid index.json")
    for report in index.get("reports", []):
        for key in ("snapshot_path", "json_path"):
            path = report.get(key)
            if isinstance(path, str) and path.startswith("data/snapshots/"):
                protected.add(path)
    for path in sorted((ROOT / "data" / "series").glob("*.json")):
        series = read_json(path, {})
        if not isinstance(series, dict) or not isinstance(series.get("series"), list):
            raise ValueError(f"Invalid published series: {path.name}")
        for point in series["series"]:
            if not isinstance(point, dict):
                raise ValueError(f"Invalid point in published series: {path.name}")
            day = point.get("date_iso")
            digest = point.get("hash_conteudo")
            if isinstance(day, str) and isinstance(digest, str):
                name = f"{day}-{digest[:12]}.json"
                if DAY_PATTERN.fullmatch(name):
                    candidate = f"data/snapshots/{path.stem}/{name}"
                    # Older series can contain points without a stored snapshot.
                    if (ROOT / candidate).is_file():
                        protected.add(candidate)
    return protected


def inspect(now: dt.date, keep_days: int = 180, sample_limit: int = 40) -> tuple[dict, list[Path]]:
    if not SNAPSHOTS.is_dir():
        raise FileNotFoundError(f"Snapshots directory is missing: {SNAPSHOTS}")
    protected = protected_snapshot_paths()
    paths = sorted(SNAPSHOTS.glob("*/*.json"))
    missing = sorted(p for p in protected if not (ROOT / p).is_file())
    # Legacy cache entries may refer to missing files. Report rather than hide
    # these inconsistencies; the audit itself never removes any files.
    counters = Counter()
    report_stats = {}
    candidates = []
    examples = []
    invalid = []
    for path in paths:
        rel = relative(path)
        match = DAY_PATTERN.fullmatch(path.name)
        group = report_stats.setdefault(path.parent.name, {"files": 0, "bytes": 0, "candidates": 0, "candidate_bytes": 0})
        size = path.stat().st_size
        group["files"] += 1
        group["bytes"] += size
        counters["total_files"] += 1
        counters["total_bytes"] += size
        if rel in protected:
            counters["protected_by_reference"] += 1
            continue
        if not match:
            counters["protected_unrecognized_name"] += 1
            if len(invalid) < sample_limit:
                invalid.append(rel)
            continue
        try:
            date = dt.date.fromisoformat(match.group(1))
        except ValueError:
            counters["protected_invalid_date"] += 1
            continue
        if date > now or (now - date).days <= keep_days:
            counters["protected_by_age"] += 1
            continue
        # Protect year-end reports, even when not indexed, pending manual review.
        if date.month == 12 and date.day >= 28:
            counters["protected_year_end"] += 1
            continue
        counters["candidate_files"] += 1
        counters["candidate_bytes"] += size
        group["candidates"] += 1
        group["candidate_bytes"] += size
        candidates.append(path)
        if len(examples) < sample_limit:
            examples.append(rel)
    result = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "mode": "audit_only_by_default",
        "policy": {"minimum_age_days": keep_days, "reference_checks": True, "year_end_protection": True},
        "summary": dict(counters),
        "by_report": report_stats,
        "candidates_sample": examples,
        "unrecognized_sample": invalid,
        "referenced_snapshot_count": len(protected),
        "missing_referenced_count": len(missing),
        "missing_referenced_sample": missing[:sample_limit],
    }
    return result, candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit orphaned/obsolete JSON snapshots")
    parser.add_argument("--keep-days", type=int, default=180)
    parser.add_argument("--output", default=str(DEFAULT_AUDIT))
    parser.add_argument("--no-write", action="store_true")
    args = parser.parse_args()
    if args.keep_days < 180:
        parser.error("--keep-days must be at least 180")
    audit, _candidates = inspect(dt.date.today(), args.keep_days)
    audit["execution"] = {"deleted_files": 0, "deleted_bytes": 0}
    print(json.dumps({"summary": audit["summary"], "execution": audit["execution"]}, ensure_ascii=False))
    if not args.no_write:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
