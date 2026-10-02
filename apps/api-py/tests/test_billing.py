from datetime import datetime

from app.modules.billing.service import (
    current_period_key,
    parse_pending_registration_external_ref,
    parse_subscription_external_ref,
    price_year_usd_cents,
)


def test_price_year_is_ten_months() -> None:
    assert price_year_usd_cents(3900) == 39000
    assert price_year_usd_cents(0) == 0


def test_current_period_key_uses_utc_month() -> None:
    assert current_period_key(datetime(2026, 3, 9, 23, 59)) == "2026-03"


def test_parse_external_refs() -> None:
    assert parse_pending_registration_external_ref("preg:abc123:pro:year") == {
        "pendingId": "abc123",
        "planCode": "pro",
        "interval": "year",
    }
    assert parse_pending_registration_external_ref("preg:abc:free:month") is None
    assert parse_subscription_external_ref("sub:co1:business:month") == {
        "companyId": "co1",
        "planCode": "business",
        "interval": "month",
    }
    assert parse_subscription_external_ref("preg:co1:pro:month") is None
