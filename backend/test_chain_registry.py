import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from core import DEFAULT_CHAINS
from lead_filters import is_chain


class ChainRegistryTests(unittest.TestCase):
    def test_confirmed_regional_networks_match_by_name_and_official_domain(self):
        cases = {
            "Buntaro": "https://buntaro.ru/",
            "Фенко": "https://fenkovrn.ru/shops/",
            "РЕТ": "https://www.ret.ru/",
        }

        for name, website in cases.items():
            with self.subTest(name=name):
                self.assertTrue(is_chain({"name": name, "websites": []}, DEFAULT_CHAINS))
                self.assertTrue(is_chain({"name": "Магазин", "websites": [website]}, DEFAULT_CHAINS))

    def test_chain_matching_keeps_similar_independent_names(self):
        self.assertFalse(is_chain({"name": "Buntarov Lab", "websites": []}, DEFAULT_CHAINS))

    def test_existing_cofix_rule_is_preserved(self):
        self.assertTrue(is_chain({"name": "Cofix", "websites": []}, DEFAULT_CHAINS))


if __name__ == "__main__":
    unittest.main()
