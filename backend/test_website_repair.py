import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from lead_pipeline import organization_data_from_lead
from lead_studio.adapters.sqlite_repo import SQLiteRepo
from leads import lead_from_item, save_lead
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

    def test_deduplicates_equivalent_messenger_links_without_merging_distinct_vk_pages(self):
        websites, socials = links_from_item(
            {
                "socialLinks": [
                    {"href": "https://t.me/+79805415504"},
                    {"href": "https://t.me/79805415504"},
                    {"href": "https://wa.me/79805415504?text=hello"},
                    {"href": "https://api.whatsapp.com/send?phone=79805415504"},
                    {"href": "https://vk.ru/allauto_service"},
                    {"href": "https://vk.com/allauto_service"},
                    {"href": "https://vk.ru/club133296133"},
                ],
            },
            {},
        )

        self.assertEqual(websites, [])
        self.assertEqual(
            socials,
            [
                "https://t.me/+79805415504",
                "https://wa.me/79805415504?text=hello",
                "https://vk.ru/allauto_service",
                "https://vk.ru/club133296133",
            ],
        )

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

    def test_repairs_multi_source_organization_and_its_saved_card(self):
        first_item = {
            "id": "borauto-salon-test",
            "title": "Боравто",
            "address": "Борисоглебск, Матросовская улица, 127",
            "urls": ["https://borauto.example/salon"],
        }
        second_item = {
            "id": "borauto-service-test",
            "title": "Боравто",
            "address": "Борисоглебск, Матросовская улица, 127",
            "urls": ["https://borauto.example/service"],
        }
        first = lead_from_item(first_item, "Борисоглебск Автосервис")
        second = lead_from_item(second_item, "Борисоглебск Автосервис")
        for lead, item in ((first, first_item), (second, second_item)):
            lead["websites"] = []
            lead["has_site"] = False
            lead["source_row"] = item

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            saved = save_lead(first, root, download=False)
            brief_path = Path(saved["folder"]) / "brief.md"
            brief_path.write_text(
                brief_path.read_text(encoding="utf-8-sig") + "\n## Ручная заметка\nСохранить\n",
                encoding="utf-8-sig",
            )
            repo = SQLiteRepo(root / "app.db")
            first_org = organization_data_from_lead(first)
            first_org["data_folder"] = saved["folder"]
            created = repo.merge_organization(first_org, {"lead_type": "NEW_SITE", "lead_status": "NEW"})
            merged = repo.merge_organization(
                organization_data_from_lead(second),
                {"lead_type": "NEW_SITE", "lead_status": "NEW"},
            )

            self.assertEqual(merged["organization_id"], created["organization_id"])
            self.assertEqual(repair_missing_website_data(repo), 1)

            repaired = repo.get_all_leads_view()[0]
            card_data = json.loads((Path(saved["folder"]) / "data.json").read_text(encoding="utf-8"))
            card_brief = brief_path.read_text(encoding="utf-8-sig")
            expected_websites = ["https://borauto.example/salon", "https://borauto.example/service"]
            self.assertEqual(repaired["websites"], expected_websites)
            self.assertEqual(repaired["lead_type"], "REDESIGN")
            self.assertEqual(card_data["websites"], expected_websites)
            self.assertTrue(card_data["has_site"])
            self.assertEqual(card_data["lead_type"], "REDESIGN")
            self.assertIn("https://borauto.example/salon", card_brief)
            self.assertIn("https://borauto.example/service", card_brief)
            self.assertIn("- Статус сайта: есть сайт (редизайн-лид)", card_brief)
            self.assertIn("## Ручная заметка\nСохранить", card_brief)

    def test_repair_keeps_clients_site_only_as_new_site(self):
        item = {
            "id": "place-est21-test",
            "title": "Place est21",
            "urls": ["https://place-est21.clients.site/"],
            "socialLinks": [{"href": "https://vk.ru/placeest21"}],
        }
        lead = lead_from_item(item, "Краснодар Салон красоты")
        lead["websites"] = []
        lead["has_site"] = False
        lead["source_row"] = item

        with tempfile.TemporaryDirectory() as tmp:
            repo = SQLiteRepo(Path(tmp) / "app.db")
            repo.merge_organization(
                organization_data_from_lead(lead),
                {"lead_type": "NEW_SITE", "lead_status": "NEW"},
            )

            self.assertEqual(repair_missing_website_data(repo), 1)
            repaired = repo.get_all_leads_view()[0]
            self.assertEqual(repaired["websites"], ["https://place-est21.clients.site/"])
            self.assertEqual(repaired["lead_type"], "NEW_SITE")


if __name__ == "__main__":
    unittest.main()
