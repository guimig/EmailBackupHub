import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import snapshot_retention_audit as audit


class SnapshotRetentionAuditTests(unittest.TestCase):
    def test_keeps_referenced_recent_and_year_end_snapshots(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            snapdir = root / "data" / "snapshots" / "example"
            snapdir.mkdir(parents=True)
            old = snapdir / "2025-06-01-aaaaaaaaaaaa.json"
            referenced = snapdir / "2025-06-02-bbbbbbbbbbbb.json"
            recent = snapdir / "2026-11-01-cccccccccccc.json"
            year_end = snapdir / "2025-12-31-dddddddddddd.json"
            for path in (old, referenced, recent, year_end):
                path.write_text('{"rows":[]}', encoding="utf-8")
            (root / "data" / "cache-index.json").write_text(json.dumps({
                "source": {"snapshot_path": "data/snapshots/example/" + referenced.name}
            }), encoding="utf-8")
            (root / "data" / "retention-plan.json").write_text('{"reports":[]}', encoding="utf-8")
            (root / "data" / "index.json").write_text('{"reports":[]}', encoding="utf-8")
            with patch.object(audit, "ROOT", root), patch.object(audit, "SNAPSHOTS", root / "data" / "snapshots"):
                result, candidates = audit.inspect(dt.date(2026, 11, 17))
                self.assertEqual(candidates, [old])
                self.assertEqual(result["summary"]["candidate_files"], 1)
                self.assertEqual(result["summary"]["protected_by_reference"], 1)
                self.assertEqual(result["summary"]["protected_by_age"], 1)
                self.assertEqual(result["summary"]["protected_year_end"], 1)
                self.assertTrue(all(p.exists() for p in (old, referenced, recent, year_end)))

    def test_missing_referenced_file_refuses_audit(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data" / "snapshots").mkdir(parents=True)
            (root / "data" / "cache-index.json").write_text(json.dumps({
                "source": {"snapshot_path": "data/snapshots/missing.json"}
            }), encoding="utf-8")
            with patch.object(audit, "ROOT", root), patch.object(audit, "SNAPSHOTS", root / "data" / "snapshots"):
                with self.assertRaises(RuntimeError):
                    audit.inspect(dt.date(2026, 11, 17))


if __name__ == "__main__":
    unittest.main()
