import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from lead_studio.adapters.sqlite_repo import SQLiteRepo


class LeadPagingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo = SQLiteRepo(Path(self.temp_dir.name) / "app.db")

    def tearDown(self):
        self.temp_dir.cleanup()

    def add_lead(self, number, name, city, review_count, lead_type="NEW_SITE", lead_status="NEW"):
        return self.repo.merge_organization(
            {
                "source": "yandex",
                "source_org_id": f"page-{number}",
                "name": name,
                "category": "Салон",
                "address": f"{city}, Тестовая, {number}",
                "city": city,
                "review_count": review_count,
                "phones_json": json.dumps([]),
                "websites_json": json.dumps([]),
                "socials_json": json.dumps([]),
                "photos_json": json.dumps([]),
                "source_url": f"https://example.test/{number}",
            },
            {"lead_type": lead_type, "lead_status": lead_status},
        )

    def test_returns_a_small_page_with_full_summary_and_sources(self):
        self.add_lead(1, "Первый", "Воронеж", 5)
        self.add_lead(2, "Второй", "Липецк", 15)
        self.add_lead(3, "Третий", "Воронеж", 25)
        self.add_lead(4, "Потенциальный", "Воронеж", 35, lead_status="POTENTIAL")

        first_page = self.repo.get_leads_page(offset=0, limit=2, status="NEW")
        second_page = self.repo.get_leads_page(offset=2, limit=2, status="NEW")

        self.assertEqual(first_page["total"], 3)
        self.assertEqual(first_page["total_leads"], 4)
        self.assertEqual(first_page["status_counts"]["NEW"], 3)
        self.assertEqual(first_page["status_counts"]["POTENTIAL"], 1)
        self.assertEqual(first_page["cities"], ["Воронеж", "Липецк"])
        self.assertEqual(len(first_page["leads"]), 2)
        self.assertEqual(len(second_page["leads"]), 1)
        self.assertTrue(first_page["leads"][0]["sources"])

    def test_applies_unicode_search_and_all_table_filters_before_paging(self):
        self.add_lead(1, "Салон красоты", "Воронеж", 75, lead_type="REDESIGN", lead_status="POTENTIAL")
        self.add_lead(2, "Салон ногтей", "Липецк", 75, lead_type="REDESIGN", lead_status="POTENTIAL")
        self.add_lead(3, "Барбершоп", "Воронеж", 5, lead_type="REDESIGN", lead_status="POTENTIAL")

        page = self.repo.get_leads_page(
            offset=0,
            limit=50,
            search="сАЛОН",
            status="POTENTIAL",
            lead_type="REDESIGN",
            city="Воронеж",
            review_range="50-100",
        )

        self.assertEqual(page["total"], 1)
        self.assertEqual([lead["name"] for lead in page["leads"]], ["Салон красоты"])

    def test_database_initialization_does_not_repeat_legacy_source_backfill(self):
        with mock.patch.object(
            SQLiteRepo,
            "_backfill_organization_sources",
            side_effect=AssertionError("legacy source backfill must run once"),
        ):
            SQLiteRepo(self.repo.db_path)


if __name__ == "__main__":
    unittest.main()
