import asyncio
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

import yamap_landing_web
from lead_studio.adapters.sqlite_repo import SQLiteRepo


class StartupMaintenanceTests(unittest.TestCase):
    def test_website_repair_runs_once_per_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = SQLiteRepo(Path(tmp) / "app.db")
            maintenance = getattr(yamap_landing_web, "repair_websites_once", None)
            self.assertIsNotNone(maintenance, "website repair must be available to the web lifecycle")
            repair = Mock()

            with patch("startup_maintenance.repair_missing_website_data", repair):
                self.assertTrue(maintenance(repo))
                self.assertFalse(maintenance(repo))

            repair.assert_called_once_with(repo)

    def test_card_file_backfill_runs_once_per_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = SQLiteRepo(Path(tmp) / "app.db")
            maintenance = getattr(yamap_landing_web, "sync_card_files_once", None)
            self.assertIsNotNone(maintenance, "card-file backfill must be available to the web lifecycle")
            websites = Mock()
            statuses = Mock()

            with patch("startup_maintenance.sync_all_organization_card_websites", websites), patch(
                "startup_maintenance.sync_all_lead_card_statuses", statuses
            ):
                self.assertTrue(maintenance(repo))
                self.assertFalse(maintenance(repo))

            websites.assert_called_once_with(repo)
            statuses.assert_called_once_with(repo)


class LifespanTests(unittest.IsolatedAsyncioTestCase):
    async def test_lifespan_yields_before_background_maintenance_finishes(self):
        started = threading.Event()
        release = threading.Event()

        def card_file_backfill(_repo):
            started.set()
            release.wait(timeout=2)

        repo = object()
        repair_websites = Mock()
        lifecycle = yamap_landing_web.lifespan(yamap_landing_web.app)
        with patch.object(yamap_landing_web, "get_db_repo", return_value=repo), patch.object(
            yamap_landing_web, "repair_websites_once", repair_websites, create=True
        ), patch.object(
            yamap_landing_web, "sync_card_files_once", side_effect=card_file_backfill, create=True
        ), patch.object(
            yamap_landing_web, "run_startup_maintenance", create=True
        ):
            await lifecycle.__aenter__()
            try:
                repair_websites.assert_called_once_with(repo)
                self.assertTrue(await asyncio.to_thread(started.wait, 0.5))
                self.assertFalse(release.is_set())
            finally:
                release.set()
                await lifecycle.__aexit__(None, None, None)


if __name__ == "__main__":
    unittest.main()
