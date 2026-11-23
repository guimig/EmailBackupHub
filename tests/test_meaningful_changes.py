"""Regression checks: no-op runs must not hide any real financial change."""
import datetime as dt
import json
import tempfile
import unittest
from email.message import EmailMessage
from pathlib import Path
from unittest.mock import patch

import data_generator as generator
import email_processor


class FinancialChangeDetectionTests(unittest.TestCase):
    def test_byte_identical_json_not_rewritten(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            self.assertTrue(generator.write_json(path, {"saldo": "1.234,56"}))
            before = path.stat().st_mtime_ns
            self.assertFalse(generator.write_json(path, {"saldo": "1.234,56"}))
            self.assertEqual(path.stat().st_mtime_ns, before)

    def test_one_cent_and_descriptive_edits_are_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "report.json"
            generator.write_json(path, {"saldo": "1.234,56", "historico": "Pagamento A"})
            self.assertTrue(generator.write_json(path, {"saldo": "1.234,57", "historico": "Pagamento A"}))
            self.assertTrue(generator.write_json(path, {"saldo": "1.234,57", "historico": "Pagamento B"}))
            self.assertFalse(generator.write_json(path, {"saldo": "1.234,57", "historico": "Pagamento B"}))

    def test_unchanged_payload_keeps_publication_timestamp(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "index.json"
            earlier = {"generated_at": "2026-11-23T08:00:00-03:00", "reports": [{"saldo": 5}]}
            generator.write_json(path, earlier)
            later = {"generated_at": "2026-11-23T09:00:00-03:00", "reports": [{"saldo": 5}]}
            self.assertEqual(generator.preserve_generated_at_if_unchanged(path, later), earlier)
            later["reports"][0]["saldo"] = 5.01
            self.assertEqual(generator.preserve_generated_at_if_unchanged(path, later)["generated_at"],
                             "2026-11-23T09:00:00-03:00")

    def test_operational_counters_do_not_change_retention_policy(self):
        base = {"schema_version": "1.6", "policy": {"keep_latest": True},
                "summary": {"total_files": 5, "cache_hits": 1, "duration_seconds": 1.5},
                "reports": [{"slug": "sample", "retained": [{"path": "emails/sample/a.html"}],
                             "processing": {"cache_hits": 1}}]}
        updated = json.loads(json.dumps(base))
        updated["summary"]["duration_seconds"] = 9.3
        updated["summary"]["cache_hits"] = 5
        updated["reports"][0]["processing"]["cache_hits"] = 5
        self.assertEqual(generator.retention_plan_content(base), generator.retention_plan_content(updated))
        updated["reports"][0]["retained"].append({"path": "emails/sample/b.html"})
        self.assertNotEqual(generator.retention_plan_content(base), generator.retention_plan_content(updated))

    def test_cached_snapshot_is_not_refreshed_for_new_hour(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "sample.html"
            source.write_text("<table><tr><td>Saldo</td><td>1,00</td></tr></table>", encoding="utf-8")
            digest = generator.content_hash_for_file(source)
            snapshot = Path(temp) / "snapshot.json"
            original = {"date_iso": "2026-11-23", "slug": "sample", "columns": [],
                        "rows": [], "totals": [], "metadata": {
                            "ultima_atualizacao": "2026-11-23T08:00:00-03:00",
                            "hash_conteudo": digest}}
            snapshot.write_text(json.dumps(original), encoding="utf-8")
            with patch.object(generator, "REPO_ROOT", temp):
                source_rel = generator.rel_path(source)
                index = {source_rel: {"content_hash": digest, "parser_version": generator.PARSER_VERSION,
                                      "snapshot_path": "snapshot.json"}}
                stats = {"cache_lookups": 0, "cache_hits": 0}
                with patch.object(generator, "refresh_document_metadata",
                                  side_effect=AssertionError("historical snapshot refreshed")):
                    doc, actual = generator.cached_document(
                        source, {}, dt.datetime.fromisoformat("2026-11-23T10:00:00-03:00"), index, stats)
            self.assertEqual(actual, digest)
            self.assertEqual(stats["cache_hits"], 1)
            self.assertEqual(doc["metadata"]["ultima_atualizacao"], "2026-11-23T08:00:00-03:00")

    def test_same_day_email_reimport_identical_or_changed_by_cent(self):
        with tempfile.TemporaryDirectory() as temp:
            message = EmailMessage()
            message["Subject"] = "Relatorio teste"
            message["From"] = "servico@example.com"
            message["Date"] = "Mon, 23 Nov 2026 10:00:00 -0300"
            message.set_content("Saldo: R$ 1,00")
            with patch.object(email_processor, "BACKUP_FOLDER", temp), patch.object(
                email_processor, "record_source_uid"
            ) as recorded:
                first = email_processor.process_message(message, "1", return_detail=True)
                self.assertEqual(first["status"], "processed")
                path = Path(first["html_path"])
                old_time = path.stat().st_mtime_ns
                email_processor.process_message(message, "2", return_detail=True)
                self.assertEqual(path.stat().st_mtime_ns, old_time)
                self.assertEqual(recorded.call_count, 1)
                changed = EmailMessage()
                changed["Subject"] = message["Subject"]
                changed["From"] = message["From"]
                changed["Date"] = message["Date"]
                changed.set_content("Saldo: R$ 1,01")
                email_processor.process_message(changed, "3", return_detail=True)
                self.assertIn("1,01", path.read_text(encoding="utf-8"))
                self.assertEqual(recorded.call_count, 2)


if __name__ == "__main__":
    unittest.main()
