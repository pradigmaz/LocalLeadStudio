import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

from lead_pipeline import auto_mark_skipped_lead, organization_data_from_lead
from lead_studio.adapters.sqlite_repo import SQLiteRepo
from lead_studio.card_files import sync_all_lead_card_statuses, sync_card_status, sync_lead_card_status
from leads import lead_from_item, save_lead


def sample_lead() -> dict:
    return lead_from_item(
        {
            "id": "card-status-test",
            "title": "Карточка статуса",
            "address": "Воронеж, улица Тестовая, 1",
            "categories": [{"name": "Кафе"}],
            "ratingData": {"ratingValue": "4.8", "ratingCount": 12, "reviewCount": 5},
            "phones": [{"number": "+74730000000", "info": ""}],
            "urls": ["https://example.test/"],
            "workingTimeText": "ежедневно",
        },
        "Воронеж Кафе",
    )


class CardStatusSyncTests(unittest.TestCase):
    def test_new_card_writes_default_status_to_json_and_brief(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = save_lead(sample_lead(), Path(tmp), download=False)
            folder = Path(saved["folder"])

            data = json.loads((folder / "data.json").read_text(encoding="utf-8"))
            brief = (folder / "brief.md").read_text(encoding="utf-8-sig")

            self.assertEqual(data["lead_status"], "NEW")
            self.assertIn("Статус лида: Новый (NEW)", brief)

    def test_single_status_sync_updates_database_linked_card(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lead = sample_lead()
            saved = save_lead(lead, root, download=False)
            organization = organization_data_from_lead(lead)
            organization["data_folder"] = saved["folder"]
            repo = SQLiteRepo(root / "app.db")
            created = repo.merge_organization(organization, {"lead_type": "REDESIGN", "lead_status": "NEW"})

            repo.update_lead_status(created["lead_id"], "REJECT", "NEW", "test")

            self.assertTrue(sync_lead_card_status(repo, created["lead_id"], "REJECT"))

            folder = Path(saved["folder"])
            data = json.loads((folder / "data.json").read_text(encoding="utf-8"))
            brief = (folder / "brief.md").read_text(encoding="utf-8-sig")
            self.assertEqual(data["lead_status"], "REJECT")
            self.assertIn("Статус лида: Неликвид (REJECT)", brief)

    def test_startup_backfill_syncs_every_database_linked_card(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lead = sample_lead()
            saved = save_lead(lead, root, download=False)
            organization = organization_data_from_lead(lead)
            organization["data_folder"] = saved["folder"]
            repo = SQLiteRepo(root / "app.db")
            created = repo.merge_organization(organization, {"lead_type": "REDESIGN", "lead_status": "POTENTIAL"})

            result = sync_all_lead_card_statuses(repo)

            self.assertEqual(result, {"checked": 1, "synced": 1, "skipped": 0})
            data = json.loads((Path(saved["folder"]) / "data.json").read_text(encoding="utf-8"))
            self.assertEqual(data["lead_status"], "POTENTIAL")

    def test_status_sync_preserves_manual_brief_notes(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(save_lead(sample_lead(), Path(tmp), download=False)["folder"])
            brief_path = folder / "brief.md"
            brief_path.write_text(
                brief_path.read_text(encoding="utf-8-sig") + "\n## Ручная заметка\nНе удалять\n",
                encoding="utf-8-sig",
            )

            self.assertTrue(sync_card_status(folder, "REJECT"))

            brief = brief_path.read_text(encoding="utf-8-sig")
            self.assertIn("Статус лида: Неликвид (REJECT)", brief)
            self.assertEqual(brief.count("- Статус лида:"), 1)
            self.assertIn("## Ручная заметка\nНе удалять", brief)

    def test_automatic_junk_marking_updates_existing_card(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lead = sample_lead()
            saved = save_lead(lead, root, download=False)
            organization = organization_data_from_lead(lead)
            organization["data_folder"] = saved["folder"]
            repo = SQLiteRepo(root / "app.db")
            created = repo.merge_organization(organization, {"lead_type": "REDESIGN", "lead_status": "NEW"})

            auto_mark_skipped_lead(repo, created["lead_id"], "мало отзывов")

            data = json.loads((Path(saved["folder"]) / "data.json").read_text(encoding="utf-8"))
            self.assertEqual(repo.get_lead_status(created["lead_id"]), "JUNK")
            self.assertEqual(data["lead_status"], "JUNK")


if __name__ == "__main__":
    unittest.main()
