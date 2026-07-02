import datetime
import json
import time
from pathlib import Path

from config import REPO_ROOT, TIMEZONE


RUN_LOG_PATH = Path(REPO_ROOT) / "data" / "run-log.json"
RUN_LOG_SCHEMA_VERSION = "1.0"
MAX_RECENT_RUNS = 20


def start_run():
    return {
        "started_at": datetime.datetime.now(TIMEZONE),
        "started_monotonic": time.monotonic(),
        "errors": [],
    }


def add_run_error(run_state, stage, error):
    run_state.setdefault("errors", []).append(
        {
            "stage": str(stage),
            "message": str(error),
        }
    )


def finish_run(run_state, email_result=None, generated_artifacts=None, status=None):
    finished_at = datetime.datetime.now(TIMEZONE)
    started_at = run_state.get("started_at", finished_at)
    email_result = email_result or {}
    emails = email_result.get("emails", [])
    errors = list(run_state.get("errors", []))
    failed_emails = [item for item in emails if item.get("status") == "failed"]
    skipped_no_return = [
        item
        for item in emails
        if item.get("status") == "skipped" and item.get("reason") == "nao_houve_retorno"
    ]
    html_reports = [
        item.get("html_path")
        for item in emails
        if item.get("status") == "processed" and item.get("html_path")
    ]
    updated_reports = sorted(
        {
            item.get("slug")
            for item in emails
            if item.get("status") == "processed" and item.get("slug")
        }
    )

    if status is None:
        status = "success"
        if errors or failed_emails:
            status = "partial" if updated_reports else "error"

    duration_seconds = max(0, round(time.monotonic() - run_state.get("started_monotonic", time.monotonic()), 3))
    artifact_summary = dict(generated_artifacts or {})
    artifact_summary.setdefault("html_reports", html_reports)

    return {
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": duration_seconds,
        "status": status,
        "emails_found": int(email_result.get("emails_found", len(emails))),
        "emails_processed": sum(1 for item in emails if item.get("status") == "processed"),
        "emails_skipped": sum(1 for item in emails if item.get("status") == "skipped"),
        "emails_skipped_no_return": len(skipped_no_return),
        "errors_count": len(errors) + len(failed_emails),
        "updated_reports": updated_reports,
        "emails": emails,
        "generated_artifacts": artifact_summary,
        "errors": errors,
    }


def write_run_log(last_run):
    RUN_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    previous = {}
    if RUN_LOG_PATH.exists():
        try:
            previous = json.loads(RUN_LOG_PATH.read_text(encoding="utf-8"))
        except Exception:
            previous = {}

    recent_runs = [last_run]
    previous_last = previous.get("last_run")
    if previous_last:
        recent_runs.append(previous_last)
    recent_runs.extend(previous.get("recent_runs", []))

    deduplicated = []
    seen_started_at = set()
    for item in recent_runs:
        if not isinstance(item, dict):
            continue
        started_at = item.get("started_at")
        if started_at in seen_started_at:
            continue
        seen_started_at.add(started_at)
        deduplicated.append(item)

    payload = {
        "schema_version": RUN_LOG_SCHEMA_VERSION,
        "last_run": last_run,
        "recent_runs": deduplicated[:MAX_RECENT_RUNS],
    }
    RUN_LOG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def write_run_log_safely(last_run):
    try:
        return write_run_log(last_run)
    except Exception as error:
        print(f"Erro ao registrar log de execucao: {error}")
        return None
