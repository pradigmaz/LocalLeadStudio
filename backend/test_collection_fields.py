import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from lead_filters import apply_fields_to_parse, lead_type_for
from lead_pipeline import process_candidate
from lead_studio.adapters.sqlite_repo import SQLiteRepo


def sample_lead() -> dict:
    return {
        "id": "collection-fields-test",
        "name": "Тестовое кафе",
        "category": "Кафе",
        "address": "улица Ленина, 1",
        "city": "Воронеж",
        "region": "Воронежская область",
        "coordinates": [],
        "rating": "4.5",
        "rating_count": "8",
        "review_count": "5",
        "phones": [{"number": "+74730000000", "info": ""}],
        "websites": ["https://example.test"],
        "socials": ["https://vk.ru/example"],
        "hours": "ежедневно",
        "features": [],
        "photos": [{"url": "https://example.test/photo.jpg"}],
        "reviews": [],
        "source": "yandex",
        "source_url": "https://yandex.ru/maps/org/test/1",
        "yandex_url": "https://yandex.ru/maps/org/test/1",
        "has_site": True,
        "source_row": {},
        "query": "Воронеж кафе",
        "fetch_error": "",
    }


class Candidate:
    source = "yandex"
    source_org_id = "collection-fields-test"
    name = "Тестовое кафе"

    def __init__(self, socials: list[str] | None = None, websites: list[str] | None = None):
        self.socials = socials
        self.websites = websites

    def to_lead(self, _: str) -> dict:
        lead = sample_lead()
        if self.socials is not None:
            lead["socials"] = self.socials
        if self.websites is not None:
            lead["websites"] = self.websites
            lead["has_site"] = bool(self.websites)
        return lead


class CollectionFieldsTests(unittest.TestCase):
    def test_none_keeps_legacy_full_card(self):
        lead = sample_lead()

        apply_fields_to_parse(lead, None)

        self.assertTrue(lead["websites"])
        self.assertTrue(lead["phones"])
        self.assertTrue(lead["socials"])
        self.assertTrue(lead["photos"])

    def test_empty_selection_keeps_required_contact_channel(self):
        lead = sample_lead()

        apply_fields_to_parse(lead, [])

        self.assertEqual(lead["websites"], [])
        self.assertEqual(lead["phones"], [])
        self.assertTrue(lead["socials"])
        self.assertEqual(lead["photos"], [])
        self.assertTrue(lead["has_site"])

    def test_empty_selection_is_applied_after_site_and_photo_screening(self):
        stats = {
            "scan_count": 0,
            "duplicate_count": 0,
            "created_count": 0,
            "enriched_count": 0,
            "existing_count": 0,
            "saved_count": 0,
            "skipped_count": 0,
            "error_count": 0,
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = SQLiteRepo(root / "app.db")
            run_id = repo.create_run({"name": "test-run", "output_folder": str(root / "runs" / "test-run")})
            saved: list[dict] = []

            kept = process_candidate(
                candidate=Candidate(),
                query="Воронеж кафе",
                config={
                    "skipWithSite": False,
                    "keepSitesForRedesign": True,
                    "requirePhotos": True,
                    "minReviews": 0,
                    "downloadPhotos": False,
                },
                repo=repo,
                run_id=run_id,
                output_root=root / "runs" / "test-run",
                chain_words=[],
                fields_to_parse=[],
                seen_source_ids=set(),
                saved=saved,
                skipped=[],
                stats=stats,
            )

            self.assertTrue(kept)
            self.assertEqual(len(saved), 1)
            stored = repo.get_all_leads_view()[0]
            self.assertEqual(stored["lead_type"], "REDESIGN")
            self.assertEqual(stored["websites"], [])
            self.assertTrue(stored["social_links"])
            self.assertEqual(stored["photos"], [])

    def test_contactless_leads_are_skipped_before_database_write(self):
        stats = {
            "scan_count": 0,
            "duplicate_count": 0,
            "created_count": 0,
            "enriched_count": 0,
            "existing_count": 0,
            "saved_count": 0,
            "skipped_count": 0,
            "error_count": 0,
        }
        for socials in ([], ["https://n123.yclients.com/"]):
            with self.subTest(socials=socials), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                repo = SQLiteRepo(root / "app.db")
                run_id = repo.create_run({"name": "test-run", "output_folder": str(root / "runs" / "test-run")})
                saved: list[dict] = []
                skipped: list[dict] = []

                kept = process_candidate(
                    candidate=Candidate(socials),
                    query="Воронеж кафе",
                    config={
                        "skipWithSite": False,
                        "keepSitesForRedesign": True,
                        "requirePhotos": False,
                        "minReviews": 0,
                        "downloadPhotos": False,
                    },
                    repo=repo,
                    run_id=run_id,
                    output_root=root / "runs" / "test-run",
                    chain_words=[],
                    fields_to_parse=[],
                    seen_source_ids=set(),
                    saved=saved,
                    skipped=skipped,
                    stats=stats,
                )

                self.assertFalse(kept)
                self.assertEqual(saved, [])
                self.assertEqual(repo.get_all_leads_view(), [])
                self.assertEqual(skipped[-1]["reason"], "нет соцсетей или мессенджеров")

    def test_clients_site_only_is_saved_as_new_site(self):
        stats = {
            "scan_count": 0,
            "duplicate_count": 0,
            "created_count": 0,
            "enriched_count": 0,
            "existing_count": 0,
            "saved_count": 0,
            "skipped_count": 0,
            "error_count": 0,
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = SQLiteRepo(root / "app.db")
            run_id = repo.create_run({"name": "test-run", "output_folder": str(root / "runs" / "test-run")})
            saved: list[dict] = []

            kept = process_candidate(
                candidate=Candidate(websites=["https://place-est21.clients.site/"]),
                query="Воронеж кафе",
                config={
                    "skipWithSite": True,
                    "keepSitesForRedesign": False,
                    "requirePhotos": False,
                    "minReviews": 0,
                    "downloadPhotos": False,
                },
                repo=repo,
                run_id=run_id,
                output_root=root / "runs" / "test-run",
                chain_words=[],
                fields_to_parse=None,
                seen_source_ids=set(),
                saved=saved,
                skipped=[],
                stats=stats,
            )

            self.assertTrue(kept)
            self.assertEqual(repo.get_all_leads_view()[0]["lead_type"], "NEW_SITE")
            self.assertEqual(saved[0]["angle"], "новый сайт")
            card_data = json.loads((Path(saved[0]["folder"]) / "data.json").read_text(encoding="utf-8"))
            self.assertEqual(card_data["lead_type"], "NEW_SITE")
            brief = (Path(saved[0]["folder"]) / "brief.md").read_text(encoding="utf-8-sig")
            self.assertIn("сайт-витрина (новый сайт-лид)", brief)

    def test_normal_site_or_mixed_sites_stay_redesign(self):
        for websites in (
            ["https://place-est21.ru/"],
            ["https://place-est21.clients.site/", "https://place-est21.ru/"],
        ):
            with self.subTest(websites=websites):
                lead = sample_lead()
                lead["websites"] = websites
                self.assertEqual(lead_type_for(lead), "REDESIGN")


if __name__ == "__main__":
    unittest.main()
