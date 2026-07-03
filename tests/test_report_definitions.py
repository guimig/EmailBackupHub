import unittest

from report_definitions import (
    REPORT_DEFINITIONS,
    report_columns,
    report_definition,
    report_expected_metrics,
    report_limit_days,
    report_metric_rules,
    report_periodicity,
    report_status,
    report_title,
)


class ReportDefinitionsTests(unittest.TestCase):
    def test_every_report_has_a_non_empty_title(self):
        self.assertTrue(REPORT_DEFINITIONS)

        for slug, definition in REPORT_DEFINITIONS.items():
            with self.subTest(slug=slug):
                self.assertIsInstance(definition.get("title"), str)
                self.assertTrue(definition["title"].strip())

    def test_periodicity_and_limit_days_are_consistent_when_declared(self):
        allowed_periodicities = {"diaria", "mensal", "historico"}

        for slug, definition in REPORT_DEFINITIONS.items():
            with self.subTest(slug=slug):
                periodicity = definition.get("periodicidade")
                limit_days = definition.get("limite_dias")

                if periodicity is not None:
                    self.assertIn(periodicity, allowed_periodicities)
                if periodicity in {"diaria", "mensal"}:
                    self.assertIsInstance(limit_days, int)
                    self.assertGreater(limit_days, 0)
                if periodicity == "historico":
                    self.assertIsNone(limit_days)

    def test_metric_rules_reference_expected_metrics(self):
        for slug, definition in REPORT_DEFINITIONS.items():
            expected_metrics = set(definition.get("expected_metrics") or [])
            metric_rules = definition.get("metric_rules") or {}

            with self.subTest(slug=slug):
                self.assertTrue(set(metric_rules).issubset(expected_metrics))
                for metric, rule in metric_rules.items():
                    with self.subTest(slug=slug, metric=metric):
                        self.assertIsInstance(rule, dict)
                        self.assertTrue(
                            rule.get("columns") or rule.get("fallback_columns") or rule.get("match_terms")
                        )

    def test_helper_functions_return_safe_fallbacks_for_unknown_slug(self):
        slug = "relatorio-inexistente"

        self.assertEqual(report_definition(slug), {})
        self.assertIsNone(report_title(slug))
        self.assertIsNone(report_columns(slug))
        self.assertIsNone(report_periodicity(slug))
        self.assertIsNone(report_limit_days(slug))
        self.assertIsNone(report_status(slug))
        self.assertEqual(report_expected_metrics(slug), [])
        self.assertEqual(report_metric_rules(slug), {})


if __name__ == "__main__":
    unittest.main()
