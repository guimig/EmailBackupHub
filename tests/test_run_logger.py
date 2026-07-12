import unittest

import run_logger


class RunLoggerPrivacyTests(unittest.TestCase):
    def test_finish_run_masks_email_metadata_by_default(self):
        run_state = run_logger.start_run()
        result = run_logger.finish_run(
            run_state,
            {
                "emails_found": 1,
                "emails": [
                    {
                        "uid": "123",
                        "subject": "Relatorio financeiro sensivel",
                        "sender": "pessoa@example.com",
                        "slug": "relatorio-financeiro",
                        "email_date": "2026-07-12T08:00:00-03:00",
                        "html_path": "emails/relatorio/relatorio.html",
                        "status": "processed",
                    }
                ],
            },
            {"json_files": [f"data/reports/{idx}.json" for idx in range(60)]},
        )

        email = result["emails"][0]
        self.assertEqual(email["uid"], "[omitido]")
        self.assertEqual(email["subject"], "[mascarado]")
        self.assertEqual(email["sender"], "[mascarado]")
        self.assertEqual(email["slug"], "relatorio-financeiro")
        self.assertEqual(email["status"], "processed")
        self.assertEqual(result["generated_artifacts"]["json_files"][-1], {"truncated": 10})

    def test_finish_run_limits_email_entries(self):
        run_state = run_logger.start_run()
        emails = [{"status": "skipped", "reason": "nao_houve_retorno", "slug": f"r-{idx}"} for idx in range(105)]

        result = run_logger.finish_run(run_state, {"emails_found": 105, "emails": emails}, {})

        self.assertEqual(len(result["emails"]), 101)
        self.assertEqual(result["emails"][-1], {"truncated": 5})
        self.assertEqual(result["emails_skipped_no_return"], 105)

    def test_sanitize_run_record_masks_historical_entries(self):
        result = run_logger.sanitize_run_record(
            {
                "started_at": "2026-07-12T08:00:00-03:00",
                "emails": [
                    {
                        "uid": "999",
                        "subject": "Assunto antigo",
                        "sender": "antigo@example.com",
                        "slug": "relatorio",
                        "status": "processed",
                    }
                ],
                "generated_artifacts": {"json_files": [f"data/{idx}.json" for idx in range(55)]},
            }
        )

        self.assertEqual(result["emails"][0]["uid"], "[omitido]")
        self.assertEqual(result["emails"][0]["subject"], "[mascarado]")
        self.assertEqual(result["emails"][0]["sender"], "[mascarado]")
        self.assertEqual(result["generated_artifacts"]["json_files"][-1], {"truncated": 5})


if __name__ == "__main__":
    unittest.main()
