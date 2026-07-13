import unittest

import parser_feature_flags as flags


class ParserFeatureFlagsTests(unittest.TestCase):
    def test_known_pilot_flag_is_disabled_by_default(self):
        self.assertFalse(flags.is_experimental_parser_enabled("saldos-de-contas-de-contratos"))

    def test_unknown_slug_is_disabled(self):
        self.assertFalse(flags.is_experimental_parser_enabled("relatorio-inexistente"))

    def test_no_flag_is_enabled_by_default(self):
        self.assertEqual(flags.enabled_flags(), {})
        self.assertIn("saldos-de-contas-de-contratos", flags.disabled_flags())


if __name__ == "__main__":
    unittest.main()
