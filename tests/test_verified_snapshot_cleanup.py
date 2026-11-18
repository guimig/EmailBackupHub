import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import verified_snapshot_cleanup as cleanup
import snapshot_retention_audit as audit


class VerifiedSnapshotCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.folder = self.root / "data" / "snapshots" / "sample"
        self.folder.mkdir(parents=True)
        self.day = dt.date(2025, 8, 12)
        self.digest = "a" * 64
        self.file = self.folder / f"{self.day.isoformat()}-{self.digest[:12]}.json"
        self.doc = {"date_iso": self.day.isoformat(), "metadata": {"hash_conteudo": self.digest},
                    "columns": [], "rows": [], "totals": [], "row_types": [],
                    "quality": {"issues": ["light_snapshot"]}, "html_path": "emails/sample/sample_12-08-2025.html"}
        self.file.write_text(json.dumps(self.doc), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_old_empty_unreferenced_snapshot_is_eligible(self):
        ok, digest = cleanup.eligible(self.file, dt.date(2026, 11, 17), set(), self.root)
        self.assertTrue(ok)
        self.assertEqual(digest, hashlib.sha256(self.file.read_bytes()).hexdigest())

    def test_referenced_snapshot_is_protected(self):
        ref = self.file.relative_to(self.root).as_posix()
        self.assertEqual(cleanup.eligible(self.file, dt.date(2026, 11, 17), {ref}, self.root)[1], "referenced")

    def test_nonempty_snapshot_is_protected(self):
        self.doc["rows"] = [{"value": 1}]
        self.file.write_text(json.dumps(self.doc), encoding="utf-8")
        self.assertEqual(cleanup.eligible(self.file, dt.date(2026, 11, 17), set(), self.root)[1], "contains_data")

    def test_recent_snapshot_is_protected(self):
        self.assertEqual(cleanup.eligible(self.file, dt.date(2025, 9, 1), set(), self.root)[1], "recent")

    def test_modified_snapshot_cannot_be_deleted(self):
        with patch.object(audit, "ROOT", self.root), patch.object(audit, "SNAPSHOTS", self.root / "data" / "snapshots"), patch.object(audit, "protected_snapshot_paths", return_value=set()):
            item = {"path": self.file.relative_to(self.root).as_posix(), "sha256": "0" * 64}
            with self.assertRaises(RuntimeError):
                cleanup.execute({"selected": [item]}, self.root)
            self.assertTrue(self.file.exists())

    def test_plan_is_read_only_and_bounded(self):
        with patch.object(audit, "ROOT", self.root), patch.object(audit, "SNAPSHOTS", self.root / "data" / "snapshots"), patch.object(audit, "protected_snapshot_paths", return_value=set()):
            result = cleanup.plan(dt.date(2026, 11, 17), 1)
            self.assertEqual(len(result["selected"]), 1)
            self.assertTrue(self.file.exists())


if __name__ == "__main__":
    unittest.main()
