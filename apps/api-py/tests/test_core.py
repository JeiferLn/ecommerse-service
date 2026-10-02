import json
import re
from datetime import datetime

from app.core.config import REPO_ROOT, Settings
from app.core.ids import iso, new_id
from app.core.security import hash_password, verify_password
from app.core.shared_data import has_capability, is_supported_company_country, is_valid_colombia_location


def test_new_id_has_cuid_shape() -> None:
    ids = {new_id() for _ in range(500)}
    assert len(ids) == 500
    assert all(re.fullmatch(r"c[0-9a-z]{24,}", value) for value in ids)


def test_iso_matches_js_to_iso_string() -> None:
    assert iso(datetime(2026, 10, 2, 14, 5, 9, 123456)) == "2026-10-02T14:05:09.123Z"
    assert iso(None) is None


def test_bcrypt_hashes_from_bcryptjs_still_verify() -> None:
    hashed = hash_password("Secreta123")
    assert hashed.startswith("$2b$10$")
    assert verify_password("Secreta123", hashed)
    assert not verify_password("otra", hashed)
    # bcryptjs genera prefijo $2a$; debe seguir validando.
    assert verify_password("Secreta123", "$2a$" + hashed[4:])


def test_capabilities_json_matches_typescript_export() -> None:
    data = json.loads((REPO_ROOT / "packages/types/src/data/capabilities.json").read_text("utf-8"))
    assert set(data) == {"owner", "manager", "user"}
    assert has_capability("owner", "manageBilling")
    assert not has_capability("manager", "manageBilling")
    assert not has_capability("admin", "viewCatalog")


def test_shared_geo_and_countries() -> None:
    assert is_supported_company_country(" co ")
    assert not is_supported_company_country("US")
    assert is_valid_colombia_location("Antioquia", "medellín ")


def test_database_url_converted_from_prisma_format() -> None:
    settings = Settings(
        DATABASE_URL="postgresql://u:p@localhost:5433/db?schema=public",
        JWT_SECRET="x" * 32,
        _env_file=None,  # type: ignore[call-arg]
    )
    assert settings.async_database_url == "postgresql+asyncpg://u:p@localhost:5433/db"
