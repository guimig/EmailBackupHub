"""Feature flags for future parser promotion.

All experimental parser flags must stay disabled by default. This module is not
imported by the production parser yet; it only documents and validates the
intended control surface for a future explicit promotion phase.
"""

from __future__ import annotations


EXPERIMENTAL_PARSER_BY_SLUG: dict[str, bool] = {
    "saldos-de-contas-de-contratos": False,
}


def is_experimental_parser_enabled(slug: str) -> bool:
    return EXPERIMENTAL_PARSER_BY_SLUG.get(slug, False) is True


def disabled_flags() -> dict[str, bool]:
    return {slug: enabled for slug, enabled in EXPERIMENTAL_PARSER_BY_SLUG.items() if not enabled}


def enabled_flags() -> dict[str, bool]:
    return {slug: enabled for slug, enabled in EXPERIMENTAL_PARSER_BY_SLUG.items() if enabled}
