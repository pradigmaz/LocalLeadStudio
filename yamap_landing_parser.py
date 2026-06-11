from __future__ import annotations
import argparse
import json
import re
from urllib.request import Request, urlopen
from pathlib import Path
from typing import Any
from openpyxl import load_workbook


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}
IMAGE_SIZE = "L_height"

SOCIAL_DOMAINS = (
    "yclients.com", "dikidi.net", "dikidi.ru", "prodoctorov.ru", "zoon.ru",
    "vk.com", "t.me", "wa.me", "whatsapp.com", "instagram.com",
    "facebook.com", "viber.com", "youtube.com", "ok.ru",
    "taplink.cc", "aqulas.me", "nethouse.ru"
)

def text(value: Any) -> str:
    return "" if value is None else str(value).strip()

def read_sheet_rows(path: Path, sheet_name: str) -> list[dict[str, str]]:
    wb = load_workbook(path, read_only=True, data_only=True)
    if sheet_name not in wb.sheetnames:
        return []
    ws = wb[sheet_name]
    rows = ws.iter_rows(values_only=True)
    header = [text(value) for value in next(rows, ())]
    result = []
    for row in rows:
        values = [text(value) for value in row]
        if any(values):
            result.append(dict(zip(header, values)))
    return result

def first_value(row: dict[str, str], *keys: str) -> str:
    for key in keys:
        value = row.get(key, "")
        if value:
            return value
    return ""


def extract_state(html: str) -> dict[str, Any]:
    for match in re.finditer(r"<script[^>]*>(.*?)</script>", html, flags=re.S):
        value = match.group(1).strip()
        if value.startswith("{") and '"stack"' in value and '"config"' in value:
            return json.loads(value)
    raise ValueError("Yandex state JSON not found")


def http_get_html(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_org_item(url: str) -> dict[str, Any]:
    html = http_get_html(url)
    state = extract_state(html)
    stack = state.get("stack") or []
    for entry in stack:
        items = ((entry.get("results") or {}).get("items")) or []
        for item in items:
            if item.get("type") == "business":
                return item
    raise ValueError("Business item not found")


def image_urls(item: dict[str, Any], limit: int) -> list[dict[str, str]]:
    photos = ((item.get("photos") or {}).get("items")) or []
    result = []
    for photo in photos[:limit]:
        template = text(photo.get("urlTemplate"))
        if not template:
            continue
        result.append(
            {
                "url": template.replace("%s", IMAGE_SIZE),
                "template": template,
                "alt": text(photo.get("alt")),
            }
        )
    return result


def feature_names(item: dict[str, Any]) -> list[str]:
    result = []
    for feature in item.get("features") or []:
        name = text(feature.get("name"))
        value = feature.get("value")
        if not name:
            continue
        if value is True:
            result.append(name)
        elif isinstance(value, str):
            result.append(f"{name}: {value}")
        elif isinstance(value, list):
            nested = []
            for v in value:
                if isinstance(v, dict):
                    nested.append(text(v.get("name")))
                else:
                    nested.append(str(v).strip())
            nested = [v for v in nested if v]
            if nested:
                result.append(f"{name}: {', '.join(nested)}")
    return result


def links_from_item(item: dict[str, Any], row: dict[str, str]) -> tuple[list[str], list[str]]:
    websites = []
    socials = []
    
    def route_link(href: str) -> None:
        if not href:
            return
        hl = href.lower()
        # If it's a booking widget, taplink, or social network, route it to socials
        if any(d in hl for d in SOCIAL_DOMAINS):
            socials.append(href)
        else:
            websites.append(href)

    excel_site = first_value(row, "Сайт")
    route_link(excel_site)

    for link in list(item.get("businessLinks") or []) + [{"href": url} for url in item.get("urls") or []]:
        route_link(text(link.get("href") or link.get("url")))
    for link in item.get("socialLinks") or []:
        href = text(link.get("href"))
        if href:
            socials.append(href)
    excel_socials = first_value(row, "Соцсети", "whatsapp", "telegram", "vkontakte")
    if excel_socials:
        socials.extend([part.strip() for part in excel_socials.split(",") if part.strip()])
    return sorted(set(websites)), sorted(set(socials))


def row_reviews(reviews: list[dict[str, str]], org_id: str, limit: int) -> list[dict[str, str]]:
    matched = [review for review in reviews if first_value(review, "ID бизнеса") == org_id]
    matched.sort(key=lambda item: first_value(item, "Дата обновления"), reverse=True)
    return [
        {
            "rating": first_value(review, "Оценка"),
            "text": first_value(review, "Текст"),
            "author": first_value(review, "Автор"),
            "date": first_value(review, "Дата обновления"),
            "source": first_value(review, "Ссылка Яндекс"),
        }
        for review in matched[:limit]
    ]


def enrich_row(
    row: dict[str, str],
    reviews: list[dict[str, str]],
    *,
    max_reviews: int,
    max_photos: int,
    no_network: bool,
) -> dict[str, Any]:
    org_id = first_value(row, "ID организации", "ID")
    card_url = first_value(row, "Ссылка на карточку") or f"https://yandex.ru/maps/org/{org_id}"
    item: dict[str, Any] = {}
    error = ""
    if not no_network:
        try:
            item = fetch_org_item(card_url)
        except Exception as exc:  # noqa: BLE001 - keep row-level error in output
            error = str(exc)

    websites, socials = links_from_item(item, row)
    rating = item.get("ratingData") or {}
    phones = item.get("phones") or []
    categories = item.get("categories") or []
    coords = item.get("coordinates") or []

    phones_from_row = [
        {"number": part.strip(), "info": ""}
        for part in first_value(row, "Контакты", "Телефон").split(",")
        if part.strip()
    ]
    return {
        "id": org_id,
        "name": text(item.get("title")) or first_value(row, "Название"),
        "category": ", ".join(text(c.get("name")) for c in categories if c.get("name"))
        or first_value(row, "Основная категория", "Подрубрика", "Рубрика"),
        "address": text(item.get("address")) or first_value(row, "Адрес"),
        "city": first_value(row, "Город"),
        "region": first_value(row, "Регион"),
        "coordinates": coords or first_value(row, "Координаты", "Широта"),
        "rating": rating.get("ratingValue") or first_value(row, "Рейтинг"),
        "rating_count": rating.get("ratingCount") or first_value(row, "Оценок", "Кол-во оценок"),
        "review_count": rating.get("reviewCount") or first_value(row, "Отзывов", "Кол-во отзывов"),
        "phones": [
            {"number": text(phone.get("number")), "info": text(phone.get("info"))}
            for phone in phones
        ] or phones_from_row,
        "websites": websites,
        "socials": socials,
        "hours": text(item.get("workingTimeText")) or first_value(row, "Время работы"),
        "features": feature_names(item),
        "photos": image_urls(item, max_photos),
        "reviews": row_reviews(reviews, org_id, max_reviews),
        "yandex_url": card_url,
        "has_site": bool(websites),
        "fetch_error": error,
        "source_row": row,
    }


def md_list(values: list[str], fallback: str = "не найдено") -> str:
    clean = [value for value in values if value]
    if not clean:
        return f"- {fallback}"
    return "\n".join(f"- {value}" for value in clean)


def render_brief(lead: dict[str, Any]) -> str:
    phones = [f"{p['number']} ({p['info']})".strip() for p in lead["phones"] if p.get("number")]
    photos = [photo["url"] for photo in lead["photos"]]
    reviews = [
        f"{review['rating']}★, {review['author']}, {review['date']}: {review['text']}"
        for review in lead["reviews"]
        if review.get("text")
    ]
    site_status = "есть сайт (редизайн-лид)" if lead["has_site"] else "сайт не найден"
    return "\n".join(
        [
            f"# Бриф для лендинга: {lead['name']}",
            "## Источник",
            f"- Яндекс Карты: {lead['yandex_url']}",
            f"- Статус сайта: {site_status}",
            f"- Ошибка обогащения: {lead['fetch_error'] or 'нет'}",
            "",
            "## Бизнес",
            f"- Название: {lead['name']}",
            f"- Категория: {lead['category']}",
            f"- Адрес: {lead['address']}",
            f"- Город/регион: {lead['city']} / {lead['region']}",
            f"- Рейтинг: {lead['rating']} ({lead['rating_count']} оценок, {lead['review_count']} отзывов)",
            f"- Время работы: {lead['hours'] or 'не найдено'}",
            "",
            "## Контакты",
            md_list(phones),
            "",
            "## Ссылки",
            "Сайт:",
            md_list(lead["websites"]),
            "",
            "Соцсети и мессенджеры:",
            md_list(lead["socials"]),
            "",
            "## Услуги и особенности",
            md_list(lead["features"][:30]),
            "",
            "## Фото для опоры",
            md_list(photos),
            "",
            "## Отзывы для опоры",
            md_list(reviews),
            "",
            "## Что должен подчеркнуть лендинг",
            f"- Первый экран: {lead['name']} — {lead['category']} по адресу {lead['address']}.",
            f"- Доверие: рейтинг {lead['rating']}, отзывы, реальные фото, понятные контакты.",
            '- Действие: кнопки "Позвонить", "Написать в WhatsApp", "Открыть в Яндекс Картах".',
            "- Если сайта нет: эта страница может стать основной ссылкой для клиентов.",
        ]
    )


def write_outputs(leads: list[dict[str, Any]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    briefs_dir = output_dir / "briefs"
    briefs_dir.mkdir(exist_ok=True)
    (output_dir / "leads.json").write_text(
        json.dumps(leads, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    for lead in leads:
        safe_id = re.sub(r"[^0-9A-Za-z_-]+", "_", lead["id"] or "unknown").strip("_") or "unknown"
        filename = f"{safe_id}.md"
        (briefs_dir / filename).write_text(render_brief(lead), encoding="utf-8-sig")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build landing briefs from Yandex Maps Excel exports.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("yamap_landing_output"))
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--max-reviews", type=int, default=8)
    parser.add_argument("--max-photos", type=int, default=12)
    parser.add_argument("--no-network", action="store_true")
    args = parser.parse_args()

    organizations = read_sheet_rows(args.input, "Организации")
    if not organizations:
        organizations = read_sheet_rows(args.input, "Sheet1")
    reviews = read_sheet_rows(args.input, "Отзывы")
    leads = [
        enrich_row(
            row,
            reviews,
            max_reviews=args.max_reviews,
            max_photos=args.max_photos,
            no_network=args.no_network,
        )
        for row in organizations[: args.limit]
    ]
    write_outputs(leads, args.output)
    print(f"organizations: {len(organizations)}")
    print(f"leads_written: {len(leads)}")
    print(f"output: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
