import datetime
import os
import tempfile
import unittest
from pathlib import Path

import retention


def parse_date_from_test_name(path):
    date_text = Path(path).stem.rsplit("_", 1)[-1]
    return datetime.datetime.strptime(date_text, "%d-%m-%Y").date(), None


class RetentionPolicyTests(unittest.TestCase):
    def test_first_business_day_skips_weekend(self):
        self.assertEqual(retention.first_business_day(2026, 8), datetime.date(2026, 8, 3))

    def test_report_date_maps_to_previous_closing_date(self):
        report_date = datetime.date(2026, 7, 1)

        self.assertEqual(retention.closing_date_for_report(report_date), datetime.date(2026, 6, 30))
        self.assertEqual(retention.monthly_close_key(report_date), "2026-06")

    def test_monthly_close_is_first_business_day_of_month(self):
        self.assertTrue(retention.is_monthly_close_report(datetime.date(2026, 7, 1)))
        self.assertFalse(retention.is_monthly_close_report(datetime.date(2026, 7, 2)))

    def test_retention_selection_keeps_latest_and_monthly_close(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            paths = []
            for name in (
                "relatorio_01-07-2026.html",
                "relatorio_02-07-2026.html",
                "relatorio_03-07-2026.html",
            ):
                path = base / name
                path.write_text("<html></html>", encoding="utf-8")
                paths.append(str(path))

            retained, ignored = retention.retention_selection(paths, parse_date_from_test_name)

            retained_by_name = {Path(item["path"]).name: item for item in retained}
            ignored_names = {Path(item["path"]).name for item in ignored}

            self.assertEqual(retained_by_name["relatorio_01-07-2026.html"]["reasons"], ["monthly_close"])
            self.assertEqual(retained_by_name["relatorio_03-07-2026.html"]["reasons"], ["latest"])
            self.assertEqual(ignored_names, {"relatorio_02-07-2026.html"})

    def test_retention_plan_exposes_closing_dates_and_reasons(self):
        retained = [
            {
                "path": "emails/relatorio/relatorio_01-07-2026.html",
                "date": datetime.date(2026, 7, 1),
                "closing_date": datetime.date(2026, 6, 30),
                "monthly_close_for": "2026-06",
                "reasons": ["monthly_close"],
            }
        ]

        plan = retention.retention_plan_item("relatorio", retained, [], lambda path: path)

        self.assertEqual(plan["retained_files"], 1)
        self.assertEqual(plan["monthly_close_files"], 1)
        self.assertEqual(plan["retained"][0]["closing_date_iso"], "2026-06-30")
        self.assertEqual(plan["retained"][0]["monthly_close_for"], "2026-06")
        self.assertEqual(plan["retained"][0]["reasons"], ["monthly_close"])

    def test_cleanup_retention_candidates_dry_run_does_not_delete_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            report_dir = repo_root / "emails" / "relatorio"
            report_dir.mkdir(parents=True)

            for name in (
                "relatorio_01-07-2026.html",
                "relatorio_02-07-2026.html",
                "relatorio_03-07-2026.html",
            ):
                (report_dir / name).write_text("<html></html>", encoding="utf-8")

            candidate = report_dir / "relatorio_02-07-2026.html"

            summary = retention.cleanup_retention_candidates(
                lambda: {"relatorio": [str(path) for path in report_dir.glob("*.html")]},
                parse_date_from_test_name,
                lambda path: os.path.relpath(path, repo_root).replace(os.sep, "/"),
                repo_root,
                "emails",
            )

            self.assertFalse(summary["enabled"])
            self.assertEqual(summary["removal_candidates"], 1)
            self.assertEqual(summary["deleted_files"], 0)
            self.assertTrue(candidate.exists())


if __name__ == "__main__":
    unittest.main()
