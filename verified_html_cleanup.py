"""Conservative HTML retention cleanup: manifest first, delete only on explicit apply.

Protect any HTML source referenced by current retained reports, cache-backed
snapshots or the current public index. Never remove the last HTML of a report.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

import data_generator as data
from retention import retention_selection
import snapshot_retention_audit as snapshots

ROOT = snapshots.ROOT


MAX_BATCH = 500


def plan(limit: int = MAX_BATCH) -> dict:
    if not 1 <= limit <= MAX_BATCH:
        raise ValueError(f"limit must be 1..{MAX_BATCH}")
    protected_snapshots = snapshots.protected_snapshot_paths()
    missing = [p for p in protected_snapshots if not (ROOT / p).is_file()]
    if missing:
        raise RuntimeError(f"Missing {len(missing)} referenced snapshots")
    protected_html = set()
    for rel in protected_snapshots:
        doc = json.loads((ROOT / rel).read_text(encoding="utf-8"))
        source = doc.get("html_path") if isinstance(doc, dict) else None
        if isinstance(source, str):
            protected_html.add(source)
    selected = []
    for slug, paths in sorted(data.grouped_files().items()):
        if not paths:
            continue
        retained, ignored = retention_selection(paths, data.parse_date_from_name)
        protected_html.update(data.rel_path(x["path"]) for x in retained)
        for item in ignored:
            path = Path(item["path"])
            relative = data.rel_path(path)
            if relative in protected_html or path.is_symlink():
                continue
            resolved = path.resolve(strict=True)
            if not resolved.is_relative_to((ROOT / "emails").resolve(strict=True)) or path.suffix.lower() != ".html":
                continue
            raw = path.read_bytes()
            selected.append({"path": relative, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
            if len(selected) == limit:
                return {"selected": selected, "mode": "review_before_delete"}
    return {"selected": selected, "mode": "review_before_delete"}


def execute(manifest: dict) -> int:
    # Recompute eligibility and hashes before deleting anything.
    if len(manifest.get("selected", [])) > MAX_BATCH:
        raise ValueError("Manifest exceeds safe batch limit")
    current = {x["path"]: x["sha256"] for x in plan(MAX_BATCH)["selected"]}
    for item in manifest["selected"]:
        if current.get(item["path"]) != item["sha256"]:
            raise RuntimeError(f"HTML candidate changed or is now protected: {item['path']}")
    for item in manifest["selected"]:
        (ROOT / item["path"]).unlink()
    return len(manifest["selected"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=MAX_BATCH)
    parser.add_argument("--manifest", default="html-cleanup-manifest.json")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    if args.apply and args.confirm != "DELETE_VERIFIED_HTML":
        parser.error("Explicit confirmation required")
    manifest = plan(args.limit)
    Path(args.manifest).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    removed = execute(manifest) if args.apply else 0
    print(json.dumps({"selected": len(manifest["selected"]), "removed": removed}))


if __name__ == "__main__":
    main()
