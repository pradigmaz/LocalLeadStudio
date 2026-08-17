import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from lead_pipeline import organization_data_from_lead
from lead_studio.adapters.sqlite_repo import SQLiteRepo
from leads import lead_from_item
from yamap_landing_parser import links_from_item, repair_missing_website_data


class WebsiteRepairTests(unittest.TestCase):
    def test_routes_business_urls_and_vk_away_to_websites(self):
        websites, socials = links_from_item(
            {
                "urls": ["https://franchise.skoro-pizza.ru/", "https://novovoronezh.skoro-pizza.ru/"],
                "socialLinks": [
                    {"href": "https://vk.ru/away.php?to=https%3A%2F%2Fsgoryacha.pro&utf=1"},
                    {"href": "https://vk.ru/skoropizza_nvrn"},
                ],
            },
            {},
        )

        self.assertEqual(
            websites,
            ["https://franchise.skoro-pizza.ru/", "https://novovoronezh.skoro-pizza.ru/", "https://sgoryacha.pro"],
        )
        self.assertEqual(socials, ["https://vk.ru/skoropizza_nvrn"])

    def test_does_not_treat_yandex_booking_or_social_link_as_a_website(self):
        websites, socials = links_from_item(
            {
                "urls": ["https://yandex.ru/web-maps/webview?booking[permalink]=123"],
                "businessLinks": [{"href": "https://n123.yclients.com/"}],
                "socialLinks": [{"href": "https://vk.ru/freshautoru"}],
            },
            {},
        )

        self.assertEqual(websites, [])
        self.assertEqual(socials, ["https://n123.yclients.com/", "https://vk.ru/freshautoru"])

    def test_repairs_only_missing_website_data_from_saved_yandex_payload(self):
        item = {
            "id": "sgoryacha-test",
            "title": "Сгоряча",
            "urls": ["https://sgoryacha.pro/"],
            "socialLinks": [{"href": "https://vk.ru/s_goryacha"}],
        }
        lead = lead_from_item(item, "Нововоронеж Кафе")
        lead["websites"] = []
        lead["has_site"] = False
        lead["source_row"] = item

        with tempfile.TemporaryDirectory() as tmp:
            repo = SQLiteRepo(Path(tmp) / "app.db")
            created = repo.merge_organization(
                organization_data_from_lead(lead),
                {"lead_type": "NEW_SITE", "lead_status": "NEW"},
            )

            self.assertEqual(repair_missing_website_data(repo), 1)

            repaired = repo.get_all_leads_view()[0]
            self.assertEqual(repaired["organization_id"], created["organization_id"])
            self.assertEqual(repaired["websites"], ["https://sgoryacha.pro/"])
            self.assertEqual(repaired["lead_type"], "REDESIGN")

            self.assertEqual(repair_missing_website_data(repo), 0)


if __name__ == "__main__":
    unittest.main()
