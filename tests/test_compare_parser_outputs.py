import unittest

import compare_parser_outputs as compare


class CompareParserOutputsTests(unittest.TestCase):
    def test_similarity_handles_empty_lists(self):
        self.assertEqual(compare.similarity([], []), 1.0)
        self.assertEqual(compare.similarity(["A"], []), 0.0)

    def test_similarity_compares_case_insensitive_sets(self):
        value = compare.similarity(["RAP Pago", "RAP a Pagar"], ["rap pago", "Outra"])

        self.assertEqual(value, 1 / 3)


if __name__ == "__main__":
    unittest.main()
