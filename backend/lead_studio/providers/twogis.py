from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Iterable
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlparse

from .base import ProviderBlockedError, ProviderCandidate

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
except ImportError:  # playwright отсутствует — таймаут-ветка недостижима (сначала except ImportError)
    PlaywrightTimeoutError = ()


DETAIL_ENRICH_LIMIT = 10
SOCIAL_OR_BOOKING_HOSTS = {
    "yclients.com",
    "dikidi.net",
    "dikidi.ru",
    "prodoctorov.ru",
    "zoon.ru",
    "flamp.ru",
    "vk.com",
    "vk.ru",
    "ok.ru",
    "instagram.com",
    "pinterest.com",
    "taplink.cc",
    "max.ru",
    "dzen.ru",
    "t.me",
    "telegram.org",
    "wa.me",
    "whatsapp.com",
    "youtube.com",
    "youtu.be",
}

# URL'ы-ассеты (картинки/стили/медиа) — не сайты бизнеса, режем.
_ASSET_URL_RE = re.compile(r"\.(?:png|jpe?g|gif|webp|svg|ico|css|mp4|m4v|woff2?|ttf)(?:\?|$)", re.I)

CITY_SLUGS = {
    "воронеж": "voronezh",
    "москва": "moscow",
    "санкт-петербург": "spb",
    "краснодар": "krasnodar",
    "сочи": "sochi",
}


class _TextCardParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cards: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key: value or "" for key, value in attrs}
        href = attr_map.get("href", "")
        if "/firm/" in href:
            self.cards.append({"url": href, "text": ""})

    def handle_data(self, data: str) -> None:
        if self.cards and data.strip():
            self.cards[-1]["text"] = (self.cards[-1]["text"] + " " + data.strip()).strip()


class TwogisBrowserBackend:
    def __init__(
        self,
        chrome_path: str | None = None,
        browser: str = "auto",
        browser_path: str = "",
        quiet: bool = True,
        research_dir: Path | None = None,
        profile_dir: Path | None = None,
    ):
        root = Path(__file__).resolve().parents[3]
        self.browser = browser
        self.quiet = quiet
        self.chrome_path = chrome_path or self._find_browser(browser, browser_path)
        self.browser_engine = self._browser_engine(browser, self.chrome_path)
        self.research_dir = research_dir or root / "backend" / "lead_studio_data" / "research" / "2gis"
        self.profile_dir = profile_dir or root / "lead_studio_data" / "browser_profiles" / "2gis"

    def open_search_state(self, query: str, cancel_event=None) -> dict[str, object]:
        if not self.chrome_path and self.browser_engine != "webkit":
            raise ProviderBlockedError("2gis", "Браузер не найден для 2GIS web-парсинга")
        self._raise_if_cancelled(cancel_event)
        try:
            return self._state_with_playwright(self._search_url(query), query, cancel_event=cancel_event)
        except ImportError:
            html = self._dump_dom(query, cancel_event=cancel_event)
            return {"html": html, "cards": self.extract_cards(html)}
        except PlaywrightTimeoutError:
            html = self._dump_dom(query, cancel_event=cancel_event)
            return {"html": html, "cards": self.extract_cards(html)}

    def extract_cards(self, html: str) -> list[dict[str, str]]:
        parser = _TextCardParser()
        parser.feed(html)
        return parser.cards

    def open_card(self, id_or_url: str, cancel_event=None) -> str:
        self._raise_if_cancelled(cancel_event)
        if id_or_url.startswith("http"):
            url = id_or_url
        elif id_or_url.startswith("/"):
            url = f"https://2gis.ru{id_or_url}"
        else:
            url = f"https://2gis.ru/firm/{id_or_url}"
        try:
            return str(self._state_with_playwright(url, id_or_url, write_artifacts=False, cancel_event=cancel_event).get("html") or "")
        except ImportError:
            return self._dump_url(url, cancel_event=cancel_event)
        except PlaywrightTimeoutError:
            return self._dump_url(url, cancel_event=cancel_event)

    def extract_details(self, html: str) -> dict[str, object]:
        phones = sorted(set(re.findall(r"tel:([^\"'>\s]+)", html)))
        links = [self._external_site(match) for match in re.findall(r"https?://[^\s\"'<>]+", html)]
        socials = sorted({link for link in links if link and self._is_social(link)})
        websites = sorted({link for link in links if link and not self._is_social(link)})
        return {"phones": [{"number": phone, "info": ""} for phone in phones], "websites": websites, "socials": socials}

    @staticmethod
    def _external_site(url: str) -> str:
        # обрезать HTML-сущности/мусор-хвосты (`...jpg&quot;`, кавычки) до чистого URL
        clean = re.split(r'["\'<>]|&quot|&amp', url, 1)[0].rstrip("\\),.;")
        lowered = clean.lower()
        internal_hosts = [
            "2gis.", "d-assets.", "api.2gis", "maps.2gis", "tile", "photo.2gis",
            "cdnvideo.", "cdn1.flamp", "2gis_stories",
            "yandex.", "mail.ru", "rambler.", "sberbank.", "sber.", "top100",
            "tns-counter", "google", "doubleclick", "clickstream", "visor.",
            "w3.org", "serving-sys", "schema.org", "cdnjs.", "cloudflare.",
            "connect.facebook.net", "facebook.net", "otello.",
            "facebook.com/tr", "russpass.",
        ]
        if any(host in lowered for host in internal_hosts) or lowered.endswith(".js") or "${" in clean or "`" in clean:
            return ""
        if _ASSET_URL_RE.search(lowered):  # прямые картинки/стили/медиа — не сайт
            return ""
        return clean

    @staticmethod
    def _is_social(url: str) -> bool:
        host = urlparse(url.lower()).netloc
        host = host[4:] if host.startswith("www.") else host
        return any(host == item or host.endswith(f".{item}") for item in SOCIAL_OR_BOOKING_HOSTS)

    def _state_with_playwright(self, url: str, query: str, write_artifacts: bool = True, cancel_event=None) -> dict[str, object]:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright

        self._raise_if_cancelled(cancel_event)
        network: list[dict[str, object]] = []
        html = ""
        cards: list[dict[str, str]] = []
        profile = Path(tempfile.mkdtemp(prefix="lls-2gis-pw-"))
        try:
            with sync_playwright() as playwright:
                browser_type = getattr(playwright, self.browser_engine)
                launch_options = {
                    "user_data_dir": str(profile),
                    "headless": False,
                    "viewport": {"width": 1440, "height": 950},
                    "locale": "ru-RU",
                    "timeout": 45000,
                }
                if self.chrome_path:
                    launch_options["executable_path"] = self.chrome_path
                if self.browser_engine == "chromium":
                    launch_options["args"] = [
                        "--disable-blink-features=AutomationControlled",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "--disable-notifications",
                        "--disable-popup-blocking",
                        "--window-size=1200,900",
                        *(["--window-position=-32000,-32000"] if self.quiet else ["--window-position=80,80"]),
                    ]
                context = browser_type.launch_persistent_context(
                    **launch_options,
                )
                page = context.pages[0] if context.pages else context.new_page()
                page.on("response", lambda response: network.append({
                    "url": response.url[:300],
                    "status": response.status,
                    "content_type": response.headers.get("content-type", ""),
                }))
                try:
                    self._raise_if_cancelled(cancel_event)
                    page.goto(url, wait_until="domcontentloaded", timeout=45000)
                    self._wait_with_cancel(page, 5000, cancel_event)
                    if "/search/" in url:
                        for _ in range(6):
                            self._raise_if_cancelled(cancel_event)
                            page.mouse.wheel(0, 1600)
                            self._wait_with_cancel(page, 900, cancel_event)
                        try:
                            page.wait_for_selector('a[href*="/firm/"]', timeout=12000)
                        except PlaywrightTimeoutError:
                            pass
                        self._raise_if_cancelled(cancel_event)
                        cards = self._extract_cards_from_page(page)
                    html = page.content()
                finally:
                    context.close()
        finally:
            shutil.rmtree(profile, ignore_errors=True)

        blocked = self._is_blocked(html)
        if write_artifacts:
            self._write_research_artifacts(query, html, {
                "blocked": blocked,
                "html_length": len(html),
                "cards": len(cards),
                "network_items": len(network),
            }, network)
        return {"html": html, "cards": cards}

    def _extract_cards_from_page(self, page) -> list[dict[str, str]]:
        anchors = page.locator('a[href*="/firm/"]')
        count = min(anchors.count(), 120)
        cards: list[dict[str, str]] = []
        seen: set[str] = set()
        for index in range(count):
            anchor = anchors.nth(index)
            try:
                href = anchor.get_attribute("href") or ""
                text = re.sub(r"\s+", " ", anchor.inner_text(timeout=1500) or "").strip()
            except Exception:
                continue
            if not href or href in seen:
                continue
            seen.add(href)
            cards.append({"url": href, "text": text})
        return cards

    def _search_url(self, query: str) -> str:
        return f"https://2gis.ru/{self._city_slug(query)}/search/{quote(query)}?m"

    def _dump_dom(self, query: str, cancel_event=None) -> str:
        return self._dump_url(self._search_url(query), cancel_event=cancel_event)

    def _dump_url(self, url: str, cancel_event=None) -> str:
        profile = Path(tempfile.mkdtemp(prefix="lls-2gis-"))
        try:
            command = [
                self.chrome_path,
                "--headless=new",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
                f"--user-data-dir={profile}",
                "--dump-dom",
                url,
            ]
            # encoding=utf-8: иначе Windows-локаль (cp1251/cp866) ломает кириллицу в именах.
            process = subprocess.Popen(
                command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8", errors="replace",
            )
            # communicate() дренирует pipe (иначе DOM > буфера → chrome виснет на записи = дедлок).
            while True:
                if cancel_event and cancel_event.is_set():
                    process.kill()
                    process.communicate()
                    raise RuntimeError("cancelled")
                try:
                    stdout, stderr = process.communicate(timeout=0.5)
                    break
                except subprocess.TimeoutExpired:
                    continue
            return stdout or stderr
        finally:
            time.sleep(0.1)
            shutil.rmtree(profile, ignore_errors=True)

    def _write_research_artifacts(
        self,
        query: str,
        html: str,
        summary: dict[str, object],
        network: list[dict[str, object]] | None = None,
    ) -> None:
        self.research_dir.mkdir(parents=True, exist_ok=True)
        (self.research_dir / "sample_search_dom.html").write_text(self._redact_artifact_html(html), encoding="utf-8")
        (self.research_dir / "network_summary.json").write_text(
            json.dumps({
                "mode": "playwright_persistent_chrome" if network is not None else "chrome_dump_dom",
                "query": query,
                "summary": summary,
                "network_items": len(network or []),
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def _redact_artifact_html(html: str) -> str:
        compact = re.sub(r"\s+", " ", html)
        compact = re.sub(r'(?i)("?(?:sessionId|tabId|userId|searchUserHash|webApiKey|hybridApiKey|photoApiKey|reviewApiKey|authClientId|ip)"?\s*[:=]\s*)"[^"]*"', r'\1"[redacted]"', compact)
        return compact[:20000]

    @staticmethod
    def _raise_if_cancelled(cancel_event) -> None:
        if cancel_event and cancel_event.is_set():
            raise RuntimeError("cancelled")

    @classmethod
    def _wait_with_cancel(cls, page, milliseconds: int, cancel_event) -> None:
        deadline = time.monotonic() + milliseconds / 1000
        while True:
            cls._raise_if_cancelled(cancel_event)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            page.wait_for_timeout(min(int(remaining * 1000), 250))

    @staticmethod
    def _is_blocked(html: str) -> bool:
        lowered = html.lower()
        if "/museum" in lowered:
            return True
        markers = [
            "g-recaptcha",
            "captcha__",
            "captcha-container",
            "подтвердите, что вы не робот",
            "докажите, что вы не робот",
            "вы не робот",
        ]
        return any(marker in lowered for marker in markers)

    @staticmethod
    def _city_slug(query: str) -> str:
        normalized = query.lower().replace("ё", "е")
        for city, slug in CITY_SLUGS.items():
            if city in normalized:
                return slug
        return "ru"

    @staticmethod
    def _find_browser(browser: str = "auto", custom_path: str = "") -> str:
        if browser == "custom" and custom_path and Path(custom_path).exists():
            return custom_path
        candidates_by_browser = {
            "chrome": [
                r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
                r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
                r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
                "chrome.exe",
                "chrome",
            ],
            "edge": [
                r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
                r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
                r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
                "msedge.exe",
                "msedge",
            ],
            "yandex": [
                r"%LOCALAPPDATA%\Yandex\YandexBrowser\Application\browser.exe",
                r"%ProgramFiles%\Yandex\YandexBrowser\Application\browser.exe",
                r"%ProgramFiles(x86)%\Yandex\YandexBrowser\Application\browser.exe",
            ],
            "opera": [
                r"%LOCALAPPDATA%\Programs\Opera\opera.exe",
                r"%ProgramFiles%\Opera\launcher.exe",
                r"%ProgramFiles(x86)%\Opera\launcher.exe",
                "opera.exe",
                "opera",
            ],
            "opera_gx": [
                r"%LOCALAPPDATA%\Programs\Opera GX\opera.exe",
                r"%ProgramFiles%\Opera GX\launcher.exe",
                r"%ProgramFiles(x86)%\Opera GX\launcher.exe",
            ],
            "brave": [
                r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe",
                "brave.exe",
                "brave",
            ],
            "vivaldi": [
                r"%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe",
                r"%ProgramFiles%\Vivaldi\Application\vivaldi.exe",
                r"%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe",
                "vivaldi.exe",
                "vivaldi",
            ],
            "firefox": [
                r"%ProgramFiles%\Mozilla Firefox\firefox.exe",
                r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe",
                r"%LOCALAPPDATA%\Mozilla Firefox\firefox.exe",
                "firefox.exe",
                "firefox",
            ],
            "safari": [
            ],
        }
        order = [
            "chrome", "edge", "yandex", "opera", "opera_gx", "brave", "vivaldi", "firefox", "safari"
        ]
        candidates = candidates_by_browser.get(browser, []) if browser != "auto" else [
            path for key in order for path in candidates_by_browser[key]
        ]
        for path in candidates:
            expanded = os.path.expandvars(path)
            if Path(expanded).exists():
                return expanded
            found = shutil.which(expanded) or shutil.which(path)
            if found:
                return found
        return ""

    @staticmethod
    def _browser_engine(browser: str, browser_path: str = "") -> str:
        lowered_path = browser_path.lower()
        if browser == "firefox" or "firefox" in lowered_path:
            return "firefox"
        if browser == "safari" or "safari" in lowered_path:
            return "webkit"
        return "chromium"


class TwogisProvider:
    source = "2gis"

    def __init__(self, backend: TwogisBrowserBackend | None = None):
        self.backend = backend or TwogisBrowserBackend()

    def search(self, query: str, max_scan: int, cancel_event=None) -> Iterable[ProviderCandidate]:
        state = self.backend.open_search_state(query, cancel_event=cancel_event)
        html = str(state.get("html") or "")
        if self.backend._is_blocked(html):
            raise ProviderBlockedError("2gis", "2GIS вернул captcha/museum, нужен видимый браузер или Electron session")

        seen = set()
        cards = state.get("cards")
        if not isinstance(cards, list) or not cards:
            cards = self.backend.extract_cards(html)
        details_checked = 0
        for card in cards:
            if cancel_event and cancel_event.is_set():
                raise RuntimeError("cancelled")
            if not isinstance(card, dict):
                continue
            url = str(card.get("url") or "")
            if url in seen:
                continue
            seen.add(url)
            text = self._clean_card_text(str(card.get("text") or ""))
            if not url or not text:
                continue
            org_id = self._org_id_from_url(url)
            if not org_id:
                continue
            details = {}
            if details_checked < min(max_scan, DETAIL_ENRICH_LIMIT):
                details_checked += 1
                details = self.backend.extract_details(self.backend.open_card(self._absolute_url(url), cancel_event=cancel_event))
            yield ProviderCandidate(
                source="2gis",
                source_org_id=org_id,
                source_url=self._absolute_url(url),
                name=text[:120],
                phones=details.get("phones") if isinstance(details.get("phones"), list) else [],
                websites=details.get("websites") if isinstance(details.get("websites"), list) else [],
                socials=details.get("socials") if isinstance(details.get("socials"), list) else [],
                raw={"url": url, "text": text, "details": details},
            )
            if len(seen) >= max_scan:
                break

    @staticmethod
    def _clean_card_text(text: str) -> str:
        lines = [line.strip() for line in re.split(r"[\n\r]+| {2,}", text) if line.strip()]
        if not lines:
            return re.sub(r"\s+", " ", text).strip()
        skip = {"закрыто", "открыто", "реклама", "рейтинг"}
        for line in lines:
            lowered = line.lower()
            if len(line) > 2 and not any(word in lowered for word in skip):
                return line
        return lines[0]

    @staticmethod
    def _org_id_from_url(url: str) -> str:
        match = re.search(r"/firm/([^/?#]+)", url)
        return match.group(1) if match else ""

    @staticmethod
    def _absolute_url(url: str) -> str:
        if url.startswith("http"):
            return url.split("?", 1)[0].split("#", 1)[0]
        return f"https://2gis.ru{url}".split("?", 1)[0].split("#", 1)[0]
