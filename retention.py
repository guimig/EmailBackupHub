import datetime
import os
import time
from pathlib import Path

from config import (
    RETENTION_APPLY_HTML_CLEANUP,
    RETENTION_DRY_RUN,
    RETENTION_KEEP_LATEST,
    RETENTION_KEEP_MONTHLY_CLOSE,
    RETENTION_MAX_REMOVAL_SAMPLE,
)


def elapsed_seconds(started_at):
    return round(max(0, time.monotonic() - started_at), 3)


def retention_policy():
    return {
        "dry_run": RETENTION_DRY_RUN,
        "apply_html_cleanup": RETENTION_APPLY_HTML_CLEANUP,
        "keep_latest": RETENTION_KEEP_LATEST,
        "keep_monthly_close": RETENTION_KEEP_MONTHLY_CLOSE,
        "monthly_close_source": "first_business_day_of_month",
        "closing_date_rule": "report_date_minus_one_day",
    }


def first_business_day(year, month):
    day = datetime.date(year, month, 1)
    while day.weekday() >= 5:
        day += datetime.timedelta(days=1)
    return day


def closing_date_for_report(report_date):
    return report_date - datetime.timedelta(days=1)


def monthly_close_key(report_date):
    closing_date = closing_date_for_report(report_date)
    return f"{closing_date.year:04d}-{closing_date.month:02d}"


def is_monthly_close_report(report_date):
    return report_date == first_business_day(report_date.year, report_date.month)


def dated_file_info(file_path, parse_date_from_name):
    report_date, _ = parse_date_from_name(file_path)
    closing_date = closing_date_for_report(report_date)
    return {
        "path": file_path,
        "date": report_date,
        "closing_date": closing_date,
        "monthly_close_for": monthly_close_key(report_date) if is_monthly_close_report(report_date) else None,
    }


def retention_selection(paths, parse_date_from_name):
    dated_files = sorted(
        (dated_file_info(path, parse_date_from_name) for path in paths),
        key=lambda item: (item["date"].isoformat(), os.path.getmtime(item["path"])),
    )
    if not dated_files:
        return [], []

    latest = dated_files[-1]
    selected = {}
    reasons = {}

    def keep(item, reason):
        selected[item["path"]] = item
        reasons.setdefault(item["path"], set()).add(reason)

    if RETENTION_KEEP_LATEST:
        keep(latest, "latest")
    for item in dated_files:
        date = item["date"]
        if RETENTION_KEEP_MONTHLY_CLOSE and is_monthly_close_report(date):
            keep(item, "monthly_close")

    retained = []
    ignored = []
    for item in dated_files:
        path = item["path"]
        if path in selected:
            retained.append({**item, "reasons": sorted(reasons[path])})
        else:
            ignored.append(item)
    return retained, ignored


def retention_plan_item(slug, retained, ignored, rel_path):
    def plan_entry(item, include_reasons=False):
        entry = {
            "path": rel_path(item["path"]),
            "date_iso": item["date"].isoformat(),
            "closing_date_iso": item["closing_date"].isoformat(),
        }
        if item.get("monthly_close_for"):
            entry["monthly_close_for"] = item["monthly_close_for"]
        if include_reasons:
            entry["reasons"] = item["reasons"]
        return entry

    return {
        "slug": slug,
        "total_files": len(retained) + len(ignored),
        "retained_files": len(retained),
        "ignored_by_retention": len(ignored),
        "latest_files": sum(1 for item in retained if "latest" in item["reasons"]),
        "monthly_close_files": sum(1 for item in retained if "monthly_close" in item["reasons"]),
        "retained": [plan_entry(item, include_reasons=True) for item in retained],
        "removal_candidates_sample": [plan_entry(item) for item in ignored[:RETENTION_MAX_REMOVAL_SAMPLE]],
    }


def build_retention_audit(grouped_files, parse_date_from_name, rel_path):
    started = time.monotonic()
    reports = []
    summary = {
        "dry_run": RETENTION_DRY_RUN,
        "apply_html_cleanup": RETENTION_APPLY_HTML_CLEANUP,
        "total_files": 0,
        "retained_files": 0,
        "ignored_by_retention": 0,
        "removal_candidates": 0,
        "latest_files": 0,
        "monthly_close_files": 0,
    }

    for slug, paths in sorted(grouped_files().items()):
        retained, ignored = retention_selection(paths, parse_date_from_name)
        item = retention_plan_item(slug, retained, ignored, rel_path)
        reports.append(item)
        summary["total_files"] += item["total_files"]
        summary["retained_files"] += item["retained_files"]
        summary["ignored_by_retention"] += item["ignored_by_retention"]
        summary["removal_candidates"] += item["ignored_by_retention"]
        summary["latest_files"] += item["latest_files"]
        summary["monthly_close_files"] += item["monthly_close_files"]

    summary["duration_seconds"] = elapsed_seconds(started)
    return {
        "policy": retention_policy(),
        "summary": summary,
        "reports": reports,
    }


def cleanup_retention_candidates(grouped_files, parse_date_from_name, rel_path, repo_root, backup_folder):
    started = time.monotonic()
    enabled = RETENTION_APPLY_HTML_CLEANUP and not RETENTION_DRY_RUN
    backup_root = (Path(repo_root) / backup_folder).resolve()
    summary = {
        "enabled": enabled,
        "dry_run": RETENTION_DRY_RUN,
        "apply_html_cleanup": RETENTION_APPLY_HTML_CLEANUP,
        "total_files": 0,
        "retained_files": 0,
        "removal_candidates": 0,
        "deleted_files": 0,
        "protected_files": 0,
        "errors_count": 0,
        "deleted_sample": [],
        "protected_sample": [],
        "errors": [],
    }

    for slug, paths in sorted(grouped_files().items()):
        retained, ignored = retention_selection(paths, parse_date_from_name)
        summary["total_files"] += len(paths)
        summary["retained_files"] += len(retained)
        summary["removal_candidates"] += len(ignored)

        for item in ignored:
            path = Path(item["path"])
            try:
                resolved = path.resolve()
            except OSError as error:
                summary["errors_count"] += 1
                summary["errors"].append({"path": str(path), "error": str(error)})
                continue

            is_protected = path.suffix.lower() != ".html" or not resolved.is_relative_to(backup_root)
            if is_protected:
                summary["protected_files"] += 1
                if len(summary["protected_sample"]) < 20:
                    summary["protected_sample"].append(rel_path(path))
                continue

            if not enabled:
                continue

            try:
                resolved.unlink()
                summary["deleted_files"] += 1
                if len(summary["deleted_sample"]) < 50:
                    summary["deleted_sample"].append(rel_path(path))
            except OSError as error:
                summary["errors_count"] += 1
                summary["errors"].append({"path": rel_path(path), "error": str(error)})

    summary["duration_seconds"] = elapsed_seconds(started)
    if enabled:
        print(f"Limpeza de retencao: {summary['deleted_files']} HTML(s) removidos.")
    else:
        print(f"Limpeza de retencao em dry-run: {summary['removal_candidates']} candidato(s), nenhum arquivo removido.")
    return summary
