"""Audit historical JSON snapshots without touching the production dataset.

Safe default: report only. Deletion requires explicit --apply and --confirm.
Only unreferenced snapshots outside the recent protection window are eligible.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SNAPSHOTS = ROOT / "data" / "snapshots"
DEFAULT_AUDIT = ROOT / "data" / "snapshot-retention-audit.json"
DAY_PATTERN = __import__("re").compile(r"^(\d{4}-\d{2}-\d{2})-[0-9a-f]{12}\.json$")


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
    return protected


def inspect(now: dt.date, keep_days: int = 180, sample_limit: int = 40) -> tuple[dict, list[Path]]:
    if not SNAPSHOTS.is_dir():
        raise FileNotFoundError(f"Snapshots directory is missing: {SNAPSHOTS}")
    protected = protected_snapshot_paths()
    paths = sorted(SNAPSHOTS.glob("*/*.json"))
    missing = sorted(p for p in protected if not (ROOT / p).is_file())
    if missing:
        raise RuntimeError(f"Referenced snapshots missing ({len(missing)}); refusing cleanup")
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
    }
    return result, candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit orphaned/obsolete JSON snapshots")
    parser.add_argument("--keep-days", type=int, default=180)
    parser.add_argument("--output", default=str(DEFAULT_AUDIT))
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--apply", action="store_true", help="Delete eligible unreferenced snapshots")
    parser.add_argument("--confirm", default="", help="Required exact phrase: DELETE_UNREFERENCED_SNAPSHOTS")
    args = parser.parse_args()
    if args.keep_days < 180:
        parser.error("--keep-days must be at least 180")
    if args.apply and args.confirm != "DELETE_UNREFERENCED_SNAPSHOTS":
        parser.error("--apply requires --confirm DELETE_UNREFERENCED_SNAPSHOTS")
    audit, candidates = inspect(dt.date.today(), args.keep_days)
    if args.apply:
        # Revalidate the entire reference set immediately before the first deletion.
        protected = protected_snapshot_paths()
        for path in candidates:
            if relative(path) in protected:
                raise RuntimeError(f"Snapshot became referenced: {path}")
        deleted = 0
        deleted_bytes = 0
        for path in candidates:
            size = path.stat().st_size
            path.unlink()
            deleted += 1
            deleted_bytes += size
        audit["execution"] = {"deleted_files": deleted, "deleted_bytes": deleted_bytes}
    else:
        audit["execution"] = {"deleted_files": 0, "deleted_bytes": 0}
    print(json.dumps({"summary": audit["summary"], "execution": audit["execution"]}, ensure_ascii=False))
    if not args.no_write:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
