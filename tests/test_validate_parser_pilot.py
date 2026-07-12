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


if __name__ == "__main__":
    unittest.main()
