import unittest

import validate_parser_pilot as validator


class ValidateParserPilotTests(unittest.TestCase):
    def valid_payload(self):
        return {
            "read_only": True,
            "promotion_status": "not_promoted",
            "report": "saldos-de-contas-de-contratos.html",
            "readiness": {
                "ready_for_manual_review": True,
                "requires_manual_review": True,
                "manual_review_reasons": [],
                "ready_for_production": False,
            },
            "comparison": {"experimental_risks": []},
            "production": {"columns": ["UG", "Contrato"], "rows_count": 10},
            "experimental": {"columns": ["UG", "Contrato"], "rows_count": 10, "warnings": []},
        }

    def test_valid_payload_has_no_errors(self):
        errors, warnings = validator.validate_payload(self.valid_payload())

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_rejects_promoted_artifact(self):
        payload = self.valid_payload()
        payload["promotion_status"] = "promoted"

        errors, _warnings = validator.validate_payload(payload)

        self.assertTrue(any("not_promoted" in error for error in errors))

    def test_rejects_production_ready_artifact(self):
        payload = self.valid_payload()
        payload["readiness"]["ready_for_production"] = True

        errors, _warnings = validator.validate_payload(payload)

        self.assertTrue(any("ready_for_production" in error for error in errors))

    def test_rejects_artifact_without_manual_review_requirement(self):
        payload = self.valid_payload()
        payload["readiness"]["requires_manual_review"] = False

        errors, _warnings = validator.validate_payload(payload)

        self.assertTrue(any("manual review" in error for error in errors))

    def test_rejects_generic_experimental_columns(self):
        payload = self.valid_payload()
        payload["experimental"]["columns"] = ["Valor 1", "Valor 2"]

        errors, _warnings = validator.validate_payload(payload)

        self.assertTrue(any("generic Valor" in error for error in errors))

    def test_warns_about_large_row_delta(self):
        payload = self.valid_payload()
        payload["experimental"]["rows_count"] = 15

        errors, warnings = validator.validate_payload(payload)

        self.assertEqual(errors, [])
        self.assertTrue(any("row count differs" in warning for warning in warnings))

    def valid_index_payload(self):
        return {
            "read_only": True,
            "promotion_status": "not_promoted",
            "pilots_count": 1,
            "summary": {
                "manual_review_required_count": 1,
                "ready_for_manual_review_count": 1,
                "row_delta_count": 1,
                "experimental_warnings_count": 0,
                "production_ready_count": 0,
                "safe_to_promote_any": False,
            },
            "recommended_next_step": {
                "action": "manual_review",
                "allow_production_change": False,
                "reasons": ["manual_review_required", "row_delta_present"],
            },
            "pilots": [
                {
                    "report": "saldos-de-contas-de-contratos.html",
                    "promotion_status": "not_promoted",
                    "ready_for_manual_review": True,
                    "ready_for_production": False,
                    "requires_manual_review": True,
                    "production_columns_count": 17,
                    "experimental_columns_count": 17,
                    "production_rows_count": 29,
                    "experimental_rows_count": 28,
                    "row_count_delta": 1,
                }
            ],
        }

    def test_valid_index_payload_has_no_errors(self):
        errors, warnings = validator.validate_index_payload(self.valid_index_payload())

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_rejects_index_with_production_ready_pilot(self):
        payload = self.valid_index_payload()
        payload["pilots"][0]["ready_for_production"] = True

        errors, _warnings = validator.validate_index_payload(payload)

        self.assertTrue(any("ready_for_production" in error for error in errors))

    def test_rejects_index_with_automatic_promotion_enabled(self):
        payload = self.valid_index_payload()
        payload["summary"]["safe_to_promote_any"] = True

        errors, _warnings = validator.validate_index_payload(payload)

        self.assertTrue(any("safe_to_promote_any" in error for error in errors))

    def test_rejects_index_with_inconsistent_summary_count(self):
        payload = self.valid_index_payload()
        payload["summary"]["row_delta_count"] = 0

        errors, _warnings = validator.validate_index_payload(payload)

        self.assertTrue(any("row_delta_count" in error for error in errors))

    def test_rejects_index_that_allows_production_change(self):
        payload = self.valid_index_payload()
        payload["recommended_next_step"]["allow_production_change"] = True

        errors, _warnings = validator.validate_index_payload(payload)

        self.assertTrue(any("production change" in error for error in errors))

    def test_validate_artifact_dispatches_index_payload(self):
        errors, warnings = validator.validate_artifact(self.valid_index_payload())

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
