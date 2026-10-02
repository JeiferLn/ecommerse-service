"""Datos compartidos con el frontend: viven en `packages/types/src/data/*.json`."""

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT


def _data_dir() -> Path:
    configured = os.environ.get("SHARED_DATA_DIR", "").strip()
    return Path(configured) if configured else REPO_ROOT / "packages" / "types" / "src" / "data"


@lru_cache
def _load(name: str) -> Any:
    return json.loads((_data_dir() / f"{name}.json").read_text(encoding="utf-8"))


def role_capabilities() -> dict[str, dict[str, bool]]:
    return _load("capabilities")


def has_capability(role: str, capability: str) -> bool:
    if role == "admin":
        return False
    return bool(role_capabilities().get(role, {}).get(capability, False))


def company_countries() -> list[dict[str, str]]:
    return _load("countries")


def company_country_codes() -> list[str]:
    return [country["code"] for country in company_countries()]


def is_supported_company_country(code: str | None) -> bool:
    if not code or not code.strip():
        return False
    return code.strip().upper() in company_country_codes()


def colombia_departments() -> list[str]:
    return _load("colombia")["departments"]


def colombia_municipalities(department: str) -> list[str]:
    return _load("colombia")["municipalities"].get(department, [])


def is_valid_colombia_location(department: str, municipality: str) -> bool:
    target = municipality.strip().lower()
    return any(item.lower() == target for item in colombia_municipalities(department))
