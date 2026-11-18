import unittest
from unittest.mock import patch

import verified_html_cleanup as html


class VerifiedHtmlCleanupTests(unittest.TestCase):
    def test_limit_outside_bounded_range_is_rejected(self):
        for limit in (0, -1, 501):
            with self.assertRaises(ValueError):
                html.plan(limit)

    def test_empty_report_inventory_has_no_deletions(self):
        with patch.object(html.snapshots, "protected_snapshot_paths", return_value=set()), patch.object(
            html.data, "grouped_files", return_value={}
        ):
            result = html.plan(10)
        self.assertEqual(result["selected"], [])
        self.assertEqual(result["mode"], "review_before_delete")


if __name__ == "__main__":
    unittest.main()
