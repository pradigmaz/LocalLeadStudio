from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


STATUS_LABELS = {
    "NEW": "Новый",
    "POTENTIAL": "Потенциальный",
    "IN_PROGRESS": "В работе",
    "PROCESSED": "Отработано",
    "REJECT": "Неликвид",
    "JUNK": "Мусор",
    "CHAIN": "Сетевик",
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
    if lead.get("lead_type") == "NEW_SITE" and lead["has_site"]:
        site_status = "сайт-витрина (новый сайт-лид)"
    else:
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


def normalized_status(status: str | None) -> str:
    return str(status or "NEW").strip().upper() or "NEW"


def status_line(status: str | None) -> str:
    code = normalized_status(status)
    return f"- Статус лида: {STATUS_LABELS.get(code, code)} ({code})"


def render_card_brief(lead: dict[str, Any]) -> str:
    return render_brief(lead).replace("## Источник\n", f"## Источник\n{status_line(lead.get('lead_status'))}\n", 1)


def brief_with_status(brief: str, status: str | None) -> str:
    line = status_line(status)
    updated, count = re.subn(r"(?m)^- Статус лида: .*$", line, brief, count=1)
    if count:
        return updated
    if "## Источник" in brief:
        return brief.replace("## Источник", f"## Источник\n{line}", 1)
    return f"{line}\n\n{brief}"


def normalized_websites(websites: list[str]) -> list[str]:
    return list(dict.fromkeys(website.strip() for website in websites if isinstance(website, str) and website.strip()))


def brief_with_websites(brief: str, websites: list[str]) -> str:
    site_block = f"Сайт:\n{md_list(websites)}"
    updated, count = re.subn(r"(?ms)^Сайт:\n.*?(?=\n\nСоцсети и мессенджеры:)", site_block, brief, count=1)
    if count:
        return updated
    if "## Ссылки" in brief:
        return brief.replace("## Ссылки", f"## Ссылки\n{site_block}", 1)
    return f"{brief.rstrip()}\n\n## Ссылки\n{site_block}\n"


def sync_card_status(data_folder: str | Path | None, status: str | None) -> bool:
    if not data_folder:
        return False

    folder = Path(data_folder)
    data_path = folder / "data.json"
    if not data_path.is_file():
        return False

    try:
        lead = json.loads(data_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(lead, dict):
        return False

    normalized = normalized_status(status)
    data_changed = lead.get("lead_status") != normalized
    lead["lead_status"] = normalized
    brief_path = folder / "brief.md"
    try:
        brief = brief_path.read_text(encoding="utf-8-sig") if brief_path.is_file() else None
    except (OSError, UnicodeError):
        return False
    updated_brief = brief_with_status(brief, normalized) if brief is not None else render_card_brief(lead)

    try:
        if data_changed:
            data_path.write_text(json.dumps(lead, ensure_ascii=False, indent=2), encoding="utf-8")
        if brief != updated_brief:
            brief_path.write_text(updated_brief, encoding="utf-8-sig")
    except OSError:
        return False
    return True


def sync_card_websites(data_folder: str | Path | None, websites: list[str]) -> bool:
    if not data_folder:
        return False

    folder = Path(data_folder)
    data_path = folder / "data.json"
    if not data_path.is_file():
        return False

    try:
        lead = json.loads(data_path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    if not isinstance(lead, dict):
        return False

    normalized = normalized_websites(websites)
    data_changed = lead.get("websites") != normalized or bool(lead.get("has_site")) != bool(normalized)
    lead["websites"] = normalized
    lead["has_site"] = bool(normalized)
    brief_path = folder / "brief.md"
    try:
        brief = brief_path.read_text(encoding="utf-8-sig") if brief_path.is_file() else None
    except (OSError, UnicodeError):
        return False
    updated_brief = brief_with_websites(brief, normalized) if brief is not None else render_card_brief(lead)

    try:
        if data_changed:
            data_path.write_text(json.dumps(lead, ensure_ascii=False, indent=2), encoding="utf-8")
        if brief != updated_brief:
            brief_path.write_text(updated_brief, encoding="utf-8-sig")
    except OSError:
        return False
    return True


def sync_lead_card_status(repo: Any, lead_id: str, status: str | None) -> bool:
    with repo.get_connection() as conn:
        row = conn.execute(
            "SELECT o.data_folder FROM leads l JOIN organizations o ON o.id = l.organization_id WHERE l.id = ?",
            (lead_id,),
        ).fetchone()
    return bool(row and sync_card_status(row["data_folder"], status))


def sync_all_lead_card_statuses(repo: Any) -> dict[str, int]:
    with repo.get_connection() as conn:
        rows = conn.execute(
            "SELECT l.lead_status, o.data_folder FROM leads l JOIN organizations o ON o.id = l.organization_id "
            "WHERE COALESCE(o.data_folder, '') <> ''"
        ).fetchall()

    synced = sum(sync_card_status(row["data_folder"], row["lead_status"]) for row in rows)
    return {"checked": len(rows), "synced": synced, "skipped": len(rows) - synced}


def sync_organization_card_websites(repo: Any, organization_id: str) -> bool:
    with repo.get_connection() as conn:
        row = conn.execute(
            "SELECT data_folder, websites_json FROM organizations WHERE id = ?",
            (organization_id,),
        ).fetchone()
    if not row:
        return False
    try:
        websites = json.loads(row["websites_json"] or "[]")
    except (TypeError, json.JSONDecodeError):
        return False
    return sync_card_websites(row["data_folder"], websites if isinstance(websites, list) else [])


def sync_all_organization_card_websites(repo: Any) -> dict[str, int]:
    with repo.get_connection() as conn:
        rows = conn.execute(
            "SELECT data_folder, websites_json FROM organizations WHERE COALESCE(data_folder, '') <> ''"
        ).fetchall()

    synced = 0
    for row in rows:
        try:
            websites = json.loads(row["websites_json"] or "[]")
        except (TypeError, json.JSONDecodeError):
            websites = []
        synced += sync_card_websites(row["data_folder"], websites if isinstance(websites, list) else [])
    return {"checked": len(rows), "synced": synced, "skipped": len(rows) - synced}
