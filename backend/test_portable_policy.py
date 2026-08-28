import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

import folders
from core import DATA_DIR
from lead_pipeline import build_providers, resolve_output_dir


class PortablePolicyTests(unittest.TestCase):
    def test_portable_builder_keeps_dependencies_local_and_builds_in_order(self) -> None:
        script = (PROJECT_ROOT / "build-portable.bat").read_text(encoding="utf-8")

        self.assertIn('python -m venv "%ROOT%backend\\venv"', script)
        self.assertIn('"%ROOT%backend\\venv\\Scripts\\python.exe" -m pip install --no-cache-dir', script)
        self.assertIn('NPM_CONFIG_CACHE=%CACHE_ROOT%\\npm', script)
        self.assertIn('electron_config_cache=%CACHE_ROOT%\\electron', script)
        self.assertIn('ELECTRON_BUILDER_CACHE=%CACHE_ROOT%\\electron-builder', script)
        self.assertIn('start "" "https://www.python.org/downloads/windows/"', script)
        self.assertIn('start "" "https://nodejs.org/en/download"', script)
        self.assertIn('if defined IN_SUBDIR popd', script)
        self.assertNotIn(' -g ', script)
        self.assertLess(script.index('call npm run build'), script.index('-m PyInstaller'))
        self.assertLess(script.index('-m PyInstaller'), script.index('call npm run dist'))

    def test_only_yandex_runs_when_legacy_preferences_name_2gis(self) -> None:
        providers = build_providers({"provider_priority": "2gis", "enabled_providers": ["2gis"]})

        self.assertEqual([provider.source for provider in providers], ["yandex"])

    def test_default_output_dir_uses_the_active_data_dir(self) -> None:
        self.assertEqual(resolve_output_dir({"outputDir": "lead_studio_data"}), DATA_DIR)

    def test_legacy_project_card_folder_is_safe_to_open(self) -> None:
        original = folders.DATA_DIR, folders.LEGACY_DATA_DIR, folders.PROJECT_ROOT
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card_folder = root / "lead_studio_data" / "runs" / "legacy" / "lead"
            card_folder.mkdir(parents=True)
            (card_folder / "brief.md").write_text("brief", encoding="utf-8")
            (card_folder / "data.json").write_text("{}", encoding="utf-8")
            try:
                folders.DATA_DIR = root / "portable_data"
                folders.LEGACY_DATA_DIR = root / "legacy_data"
                folders.PROJECT_ROOT = root
                self.assertTrue(folders.is_safe_lead_folder(card_folder))
            finally:
                folders.DATA_DIR, folders.LEGACY_DATA_DIR, folders.PROJECT_ROOT = original


if __name__ == "__main__":
    unittest.main()
