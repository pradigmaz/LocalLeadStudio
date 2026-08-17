from __future__ import annotations
import json
import random
import time
from pathlib import Path
from threading import Event
from typing import Callable
from urllib.error import HTTPError, URLError

from core import (
    get_db_repo,
    DATA_DIR,
    PROJECT_ROOT,
    DEFAULT_CHAINS,
    MAX_QUERY_LINES,
    MAX_PER_QUERY,
    DEFAULT_YANDEX_DELAY_SECONDS,
    MAX_YANDEX_DELAY_SECONDS,
    YANDEX_JITTER_SECONDS,
    YANDEX_STOP_CODES,
    clamp_int,
    clamp_float,
    sleep_with_cancel,
    normalize_queries,
)
from leads import search_items, lead_from_item, slug, save_lead
from lead_filters import keep_lead, is_chain, apply_fields_to_parse
from guards import (
    require_yandex_request_slot,
    record_yandex_search_attempt,
    record_yandex_cooldown,
    yandex_guard_status,
)

from lead_studio.adapters.sqlite_repo import SQLiteRepo
from lead_studio.job_manager import JobManager
from lead_studio.providers.base import LeadProvider, ProviderBlockedError, ProviderCandidate
from lead_studio.providers.yandex import YandexProvider


def organization_data_from_lead(lead: dict) -> dict:
    source = lead.get("source") or "yandex"
    source_url = lead.get("source_url") or lead.get("yandex_url") or ""
    dedupe_key = SQLiteRepo.dedupe_key_for(lead.get("name"), lead.get("address"))
    return {
        "source": source,
        "source_org_id": str(lead["id"]),
        "dedupe_key": dedupe_key,
        "name": lead["name"],
        "category": lead["category"],
        "address": lead["address"],
        "city": lead["city"],
        "region": lead["region"],
        "coordinates_json": json.dumps(lead["coordinates"], ensure_ascii=False),
        "rating": float(lead["rating"]) if lead["rating"] else None,
        "rating_count": int(lead["rating_count"]) if lead["rating_count"] else 0,
        "review_count": int(lead["review_count"]) if lead["review_count"] else 0,
        "phones_json": json.dumps(lead["phones"], ensure_ascii=False),
        "websites_json": json.dumps(lead["websites"], ensure_ascii=False),
        "socials_json": json.dumps(lead["socials"], ensure_ascii=False),
        "hours": lead["hours"],
        "features_json": json.dumps(lead["features"], ensure_ascii=False),
        "source_url": source_url,
        "photos_json": json.dumps(lead["photos"], ensure_ascii=False),
        "raw_json": json.dumps(lead.get("source_row") or {}, ensure_ascii=False),
    }


def build_providers(config: dict) -> list[LeadProvider]:
    del config
    return [YandexProvider(search_items, lead_from_item)]


def resolve_output_dir(config: dict) -> Path:
    raw_output_dir = str(config.get("outputDir") or "").strip()
    if not raw_output_dir or raw_output_dir == "lead_studio_data":
        return DATA_DIR

    output_dir = Path(raw_output_dir)
    return output_dir if output_dir.is_absolute() else PROJECT_ROOT / output_dir


def default_max_scan(max_per_query: int, config: dict) -> int:
    raw_scan = config.get("maxScanPerQuery")
    if raw_scan is not None:
        return clamp_int(raw_scan, max(max_per_query, 1), max_per_query, 100)
    multiplier = clamp_int(config.get("max_scan_multiplier"), 5, 1, 20)
    return min(100, max(30, max_per_query * multiplier))


def auto_mark_skipped_lead(repo: SQLiteRepo, lead_db_id: str, reason: str) -> None:
    current_status = repo.get_lead_status(lead_db_id)
    if current_status != "NEW":
        return

    reason_lower = reason.lower()
    if "сетевик" in reason_lower:
        repo.update_lead_status(lead_db_id, "CHAIN", current_status, "Авторазметка при парсинге")
    elif "мало отзывов" in reason_lower or "нет фото" in reason_lower:
        repo.update_lead_status(lead_db_id, "JUNK", current_status, "Авторазметка при парсинге")
    elif "популярное место" in reason_lower or "село/деревня" in reason_lower or "вне выбранного города" in reason_lower:
        repo.update_lead_status(lead_db_id, "REJECT", current_status, "Авторазметка при парсинге")


def process_candidate(
    candidate: ProviderCandidate,
    query: str,
    config: dict,
    repo: SQLiteRepo,
    run_id: str,
    output_root: Path,
    chain_words: list[str],
    fields_to_parse: list[str] | None,
    seen_source_ids: set[str],
    saved: list[dict],
    skipped: list[dict],
    stats: dict,
) -> bool:
    source_key = f"{candidate.source}:{candidate.source_org_id}"
    stats["scan_count"] += 1
    if source_key in seen_source_ids:
        stats["duplicate_count"] += 1
        skipped.append({"query": query, "name": candidate.name, "reason": "дубль в текущем запуске"})
        return False
    seen_source_ids.add(source_key)

    try:
        lead = candidate.to_lead(query)
        apply_fields_to_parse(lead, fields_to_parse)

        if is_chain(lead, chain_words):
            skipped.append({"query": query, "name": lead["name"], "reason": "сетевик"})
            stats["skipped_count"] += 1
            return False

        ok, reason = keep_lead(lead, config, chain_words)
        merge_result = repo.merge_organization(organization_data_from_lead(lead), {
            "lead_type": "REDESIGN" if lead["has_site"] else "NEW_SITE",
            "lead_status": "NEW",
            "reason": f"Парсинг {candidate.source}: {query}",
        })
        org_id = merge_result["organization_id"]
        lead_db_id = merge_result["lead_id"]
        action = merge_result["action"]

        if action == "CREATED":
            stats["created_count"] += 1
        elif action == "ENRICHED":
            stats["enriched_count"] += 1
        else:
            stats["existing_count"] += 1

        if ok:
            if action == "CREATED":
                saved_lead = save_lead(lead, output_root, bool(config.get("downloadPhotos")))
                saved.append(saved_lead)
                with repo.get_connection() as conn:
                    conn.execute(
                        "UPDATE organizations SET data_folder = ? WHERE id = ? AND (data_folder IS NULL OR data_folder = '')",
                        (saved_lead["folder"], org_id),
                    )
            repo.add_run_result(run_id, org_id, f"{candidate.source}:{query}", action, was_new=action == "CREATED", was_updated=action == "ENRICHED")
            stats["saved_count"] += 1 if action in {"CREATED", "ENRICHED"} else 0
            return action in {"CREATED", "ENRICHED"}

        skipped.append({"query": query, "name": lead["name"], "reason": reason})
        repo.add_run_result(run_id, org_id, f"{candidate.source}:{query}", "SKIPPED", skip_reason=reason, was_new=action == "CREATED", was_updated=action == "ENRICHED")
        stats["skipped_count"] += 1
        auto_mark_skipped_lead(repo, lead_db_id, reason)
        return False
    except Exception as exc:
        stats["error_count"] += 1
        skipped.append({"query": query, "name": candidate.name, "reason": f"ошибка обработки {candidate.source}: {exc}"})
        print(f"Error processing {candidate.source} item: {exc}")
        return False


def run_job(
    config: dict,
    progress_callback: Callable[[dict], None] | None = None,
    cancel_event: Event | None = None,
) -> dict:
    raw_queries = normalize_queries(config.get("queries") or "")
    query_limit = clamp_int(config.get("maxQueries"), MAX_QUERY_LINES, 1, MAX_QUERY_LINES)
    queries = raw_queries[:query_limit]
    run_name = slug(config.get("runName") or "yamap_run")
    output_dir = resolve_output_dir(config)
    output_root = output_dir / "runs" / run_name
    output_root.mkdir(parents=True, exist_ok=True)
    user_chain_words = [part.strip().lower() for part in (config.get("excludeChains") or "").split(",")]
    chain_words = [word for word in dict.fromkeys([*DEFAULT_CHAINS, *user_chain_words]) if word]
    max_per_query = clamp_int(config.get("maxPerQuery"), 10, 1, MAX_PER_QUERY)
    request_delay = clamp_float(
        config.get("requestDelaySeconds"),
        DEFAULT_YANDEX_DELAY_SECONDS,
        DEFAULT_YANDEX_DELAY_SECONDS,
        MAX_YANDEX_DELAY_SECONDS,
    )
    fields_to_parse = config.get("fields_to_parse")
    # Initialize DB Repo
    repo = get_db_repo()
    preferences = repo.get_preferences()
    effective_config = {**preferences, **{key: value for key, value in config.items() if value is not None}}
    providers = build_providers(effective_config)
    max_scan_per_query = default_max_scan(max_per_query, effective_config)
    
    # Track the run
    run_id = repo.create_run({
        "name": config.get("runName") or "yamap_run",
        "region": "",
        "queries_json": json.dumps(queries, ensure_ascii=False),
        "filters_json": json.dumps(effective_config, ensure_ascii=False),
        "output_folder": str(output_root)
    })
    
    saved, skipped = [], []
    stats = {
        "saved_count": 0,
        "skipped_count": 0,
        "duplicate_count": 0,
        "error_count": 0,
        "scan_count": 0,
        "created_count": 0,
        "enriched_count": 0,
        "existing_count": 0,
    }
    status = "FINISHED"
    rate_limit_error = ""
    blocked_source = ""

    if progress_callback:
        progress_callback({"query_total": len(queries), "query_index": 0, "provider_total": len(providers)})

    seen_source_ids = set()
    last_request_at = {"yandex": 0.0, "2gis": 0.0}
    for query_index, query in enumerate(queries, 1):
        if cancel_event and cancel_event.is_set():
            status = "CANCELLED"
            break

        for provider_index, provider in enumerate(providers, 1):
            if cancel_event and cancel_event.is_set():
                status = "CANCELLED"
                break
            if progress_callback:
                progress_callback({
                    "current_query": query,
                    "query_index": query_index,
                    "current_provider": provider.source,
                    "provider_index": provider_index,
                    "provider_total": len(providers),
                    **stats,
                })

            elapsed = time.monotonic() - last_request_at.get(provider.source, 0.0)
            wait_time = request_delay + random.uniform(0, YANDEX_JITTER_SECONDS) - elapsed
            if last_request_at.get(provider.source) and wait_time > 0 and not sleep_with_cancel(wait_time, cancel_event):
                status = "CANCELLED"
                break

            useful_count = 0
            try:
                if provider.source == "yandex":
                    require_yandex_request_slot()
                    record_yandex_search_attempt()
                if provider.source == "2gis":
                    candidates = provider.search(query, max_scan_per_query, cancel_event=cancel_event)  # type: ignore[call-arg]
                else:
                    candidates = provider.search(query, max_scan_per_query)
                for candidate in candidates:
                    if cancel_event and cancel_event.is_set():
                        status = "CANCELLED"
                        break
                    changed = process_candidate(
                        candidate=candidate,
                        query=query,
                        config=effective_config,
                        repo=repo,
                        run_id=run_id,
                        output_root=output_root,
                        chain_words=chain_words,
                        fields_to_parse=fields_to_parse,
                        seen_source_ids=seen_source_ids,
                        saved=saved,
                        skipped=skipped,
                        stats=stats,
                    )
                    useful_count += 1 if changed else 0
                    if progress_callback:
                        progress_callback(stats)
                    if useful_count >= max_per_query:
                        break
                last_request_at[provider.source] = time.monotonic()
            except ProviderBlockedError as exc:
                stats["error_count"] += 1
                blocked_source = exc.source
                skipped.append({"query": query, "name": "", "reason": str(exc)})
                if progress_callback:
                    progress_callback({"blocked_source": blocked_source, **stats})
            except RuntimeError as exc:
                if cancel_event and cancel_event.is_set():
                    status = "CANCELLED"
                    break
                stats["error_count"] += 1
                status = "RATE_LIMITED"
                rate_limit_error = str(exc)
                break
            except HTTPError as exc:
                stats["error_count"] += 1
                if provider.source == "yandex" and exc.code in YANDEX_STOP_CODES:
                    record_yandex_cooldown(exc.code)
                    status = "RATE_LIMITED"
                    rate_limit_error = f"Яндекс вернул HTTP {exc.code}; сбор остановлен, чтобы не усиливать блокировку"
                    break
                skipped.append({"query": query, "name": "", "reason": f"{provider.source} HTTP {exc.code}"})
            except (URLError, TimeoutError, ValueError) as exc:
                stats["error_count"] += 1
                skipped.append({"query": query, "name": "", "reason": f"{provider.source} ошибка запроса: {exc}"})
        if status == "CANCELLED" or status == "RATE_LIMITED":
            break
        if progress_callback:
            progress_callback(stats)

    repo.update_run_stats(run_id, stats)
    repo.finish_run(run_id, status)

    (output_root / "summary.json").write_text(
        json.dumps({
            "saved": saved,
            "skipped": skipped,
            "run_id": run_id,
            "status": status,
            "error": rate_limit_error,
            "blocked_source": blocked_source,
            "stats": stats,
            "query_limit_applied": len(raw_queries) > len(queries),
            "max_scan_per_query": max_scan_per_query,
            "yandex_guard": yandex_guard_status(),
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "output": str(output_root),
        "saved": saved,
        "skipped": skipped,
        "run_id": run_id,
        "status": status,
        "error": rate_limit_error,
        "blocked_source": blocked_source,
        "stats": stats,
        "query_count": len(queries),
        "max_scan_per_query": max_scan_per_query,
        "yandex_guard": yandex_guard_status(),
        "_job_status": status,
    }


JOB_MANAGER = JobManager(run_job)
