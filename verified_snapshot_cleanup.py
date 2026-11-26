"""Conservative batch cleanup of provably empty, unreferenced historical snapshots.

The default is read-only. A deletion requires --apply and an exact confirmation.
The script does not commit or push, and aborts on broken cache references.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

import snapshot_retention_audit as audit
from config import RETENTION_WEEKLY_UNTIL_DAYS, TIMEZONE

NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-([0-9a-f]{12})\.json$")
DEFAULT_BATCH = 50
MAX_BATCH = 5000
MIN_AGE_DAYS = RETENTION_WEEKLY_UNTIL_DAYS


def today() -> dt.date:
    return dt.datetime.now(TIMEZONE).date()


def eligible(path: Path, now: dt.date, protected: set[str], root: Path) -> tuple[bool, str]:
    try:
        resolved = path.resolve(strict=True)
        snapshots_root = (root / "data" / "snapshots").resolve(strict=True)
        if not resolved.is_relative_to(snapshots_root) or path.is_symlink():
            return False, "unsafe_path"
        relative = path.relative_to(root).as_posix()
        if relative in protected:
            return False, "referenced"
        match = NAME.fullmatch(path.name)
        if not match:
            return False, "unrecognized_name"
        day = dt.date.fromisoformat(match.group(1))
        if (now - day).days <= MIN_AGE_DAYS:
            return False, "recent"
        if day.month == 12 and day.day >= 28 or day.month == 1 and day.day <= 7:
            return False, "year_boundary"
        raw = path.read_bytes()
        doc = json.loads(raw)
        if not isinstance(doc, dict):
            return False, "invalid_document"
        if doc.get("date_iso") != day.isoformat():
            return False, "date_mismatch"
        metadata = doc.get("metadata")
        content_hash = metadata.get("hash_conteudo") if isinstance(metadata, dict) else None
        if not isinstance(content_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", content_hash) or not content_hash.startswith(match.group(2)):
            return False, "hash_mismatch"
        if doc.get("columns") != [] or doc.get("rows") != [] or doc.get("totals") != [] or doc.get("row_types") != []:
            return False, "contains_data"
        if any(doc.get(key) not in (None, {}, []) for key in ("metrics", "metrics_meta", "column_schema")):
            return False, "contains_derived_data"
        if any(metadata.get(key, 0) != 0 for key in ("row_count", "column_count")):
            return False, "nonzero_counts"
        quality = doc.get("quality")
        if not isinstance(quality, dict) or "light_snapshot" not in quality.get("issues", []):
            return False, "not_light_snapshot"
        html_path = doc.get("html_path")
        if not isinstance(html_path, str) or not html_path.startswith("emails/"):
            return False, "invalid_source"
        return True, hashlib.sha256(raw).hexdigest()
    except (OSError, ValueError, TypeError, json.JSONDecodeError, KeyError):
        return False, "unreadable"


def plan(now: dt.date, limit: int = DEFAULT_BATCH, root: Path | None = None) -> dict:
    if not 1 <= limit <= MAX_BATCH:
        raise ValueError(f"limit must be 1..{MAX_BATCH}")
    root = root or audit.ROOT
    with_reference_root = root == audit.ROOT
    if not with_reference_root:
        raise ValueError("Use the module's ROOT for repository execution")
    protected = audit.protected_snapshot_paths()
    missing = [p for p in protected if not (root / p).is_file()]
    if missing:
        raise RuntimeError(f"Refusing cleanup: {len(missing)} referenced snapshots are missing")
    checked = 0
    selected = []
    for path in sorted((root / "data" / "snapshots").glob("*/*.json")):
        checked += 1
        ok, detail = eligible(path, now, protected, root)
        if ok:
            selected.append({"path": path.relative_to(root).as_posix(), "sha256": detail, "bytes": path.stat().st_size})
            if len(selected) == limit:
                break
    return {"created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "base": "read_only_candidate_review", "checked": checked,
            "max_batch": limit, "selected": selected,
            "selected_bytes": sum(item["bytes"] for item in selected)}


def execute(manifest: dict, root: Path) -> int:
    if len(manifest.get("selected", [])) > MAX_BATCH:
        raise ValueError("Manifest exceeds safe batch limit")
    protected = audit.protected_snapshot_paths()
    if any(not (root / p).is_file() for p in protected):
        raise RuntimeError("Referenced snapshot missing; cleanup refused")
    now = today()
    # Validate the complete batch before removing its first file.
    for item in manifest["selected"]:
        path = root / item["path"]
        ok, digest = eligible(path, now, protected, root)
        if not ok or digest != item["sha256"]:
            raise RuntimeError(f"Candidate changed: {item['path']}")
    for item in manifest["selected"]:
        (root / item["path"]).unlink()
    return len(manifest["selected"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=DEFAULT_BATCH)
    parser.add_argument("--manifest", default="snapshot-cleanup-manifest.json")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    if not 1 <= args.limit <= MAX_BATCH:
        parser.error(f"--limit must be 1..{MAX_BATCH}")
    if args.apply and args.confirm != "DELETE_VERIFIED_EMPTY_SNAPSHOTS":
        parser.error("--apply requires --confirm DELETE_VERIFIED_EMPTY_SNAPSHOTS")
    result = plan(today(), args.limit)
    output = Path(args.manifest)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    removed = execute(result, audit.ROOT) if args.apply else 0
    print(json.dumps({"reviewed": result["checked"], "selected": len(result["selected"]),
                      "bytes": result["selected_bytes"], "removed": removed}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
