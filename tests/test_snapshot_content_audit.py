import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import snapshot_content_audit as content_audit
import snapshot_retention_audit as retention


class SnapshotContentAuditTests(unittest.TestCase):
    def test_nonempty_and_empty_snapshots_are_distinguished_without_deletion(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / "data" / "snapshots" / "report"
            directory.mkdir(parents=True)
            first = directory / "2025-08-12-aaaaaaaaaaaa.json"
            second = directory / "2025-08-13-bbbbbbbbbbbb.json"
            first.write_text(json.dumps({"rows": [{"value": 12}], "columns": ["value"], "totals": [],
                                         "html_path": "emails/report/source.html"}), encoding="utf-8")
            second.write_text(json.dumps({"rows": [], "columns": [], "totals": [],
                                          "quality": {"issues": ["light_snapshot"]}}), encoding="utf-8")
            with patch.object(retention, "ROOT", root), patch.object(retention, "protected_snapshot_paths", return_value=set()):
                result = content_audit.inspect_content(root, dt.date(2026, 11, 18), 2)
            self.assertEqual(result["summary"]["contains_financial_data"], 1)
            self.assertEqual(result["summary"]["empty_light_snapshot"], 1)
            self.assertEqual(result["summary"]["source_html_missing_or_invalid"], 2)
            self.assertTrue(first.is_file() and second.is_file())

    def test_referenced_snapshots_are_never_inspected_as_candidates(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / "data" / "snapshots" / "report"
            directory.mkdir(parents=True)
            first = directory / "2025-08-12-aaaaaaaaaaaa.json"
            first.write_text('{"rows":[],"columns":[],"totals":[]}', encoding="utf-8")
            with patch.object(retention, "ROOT", root), patch.object(
                retention, "protected_snapshot_paths",
                return_value={first.relative_to(root).as_posix()}
            ):
                result = content_audit.inspect_content(root, dt.date(2026, 11, 18), 1)
            self.assertEqual(result["summary"]["skipped_referenced"], 1)
            self.assertEqual(result["summary"].get("inspected", 0), 0)

    def test_missing_referenced_file_blocks_audit(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data" / "snapshots").mkdir(parents=True)
            with patch.object(retention, "ROOT", root), patch.object(
                retention, "protected_snapshot_paths",
                return_value={"data/snapshots/missing.json"}
            ):
                with self.assertRaises(RuntimeError):
                    content_audit.inspect_content(root, dt.date(2026, 11, 18), 1)


if __name__ == "__main__":
    unittest.main()
