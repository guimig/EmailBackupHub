import unittest
from unittest.mock import MagicMock, patch

import imap_client


class FetchUnreadEmailsTests(unittest.TestCase):
    def setUp(self):
        self.mail = MagicMock()
        connection = patch.object(imap_client, "connect_imap", return_value=self.mail)
        connection.start()
        self.addCleanup(connection.stop)
        self.mail.select.return_value = ("OK", [])

    def test_empty_inbox_is_a_successful_search(self):
        self.mail.uid.return_value = ("OK", [b""])
        self.assertEqual(imap_client.fetch_unread_emails(), [])
        self.mail.select.assert_called_once_with("inbox", readonly=True)
        self.mail.logout.assert_called_once()

    def test_search_failure_is_visible_to_the_caller(self):
        self.mail.uid.return_value = ("NO", [b""])
        with self.assertRaises(RuntimeError):
            imap_client.fetch_unread_emails()
        self.mail.logout.assert_called_once()

    def test_fetch_leaves_reports_unread_and_checks_full_body(self):
        self.mail.uid.side_effect = [("OK", [b"42"]), ("OK", [(b"header", b"body"), b")"])]
        self.assertEqual(imap_client.fetch_unread_emails(), [{"uid": "42", "raw": b"body"}])
        self.mail.uid.assert_called_with("fetch", b"42", "(BODY.PEEK[])")

    def test_failed_fetch_is_not_treated_as_empty_inbox(self):
        self.mail.uid.side_effect = [("OK", [b"42"]), ("OK", [None])]
        with self.assertRaises(RuntimeError):
            imap_client.fetch_unread_emails()
