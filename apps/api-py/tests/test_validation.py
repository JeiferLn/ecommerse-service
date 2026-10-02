from decimal import Decimal
from typing import Annotated

import pytest
from pydantic import BaseModel, ValidationError

from app.core.validation import integer, money


class Body(BaseModel):
    price: Annotated[Decimal | None, money("precio inválido", "precio negativo")] = None
    stock: Annotated[int | None, integer("stock entero", minimum=0, min_msg="stock negativo")] = None


def _message(**data: object) -> str:
    with pytest.raises(ValidationError) as info:
        Body(**data)  # type: ignore[arg-type]
    return str(info.value.errors()[0]["msg"]).removeprefix("Value error, ")


def test_money_accepts_numbers_and_numeric_strings() -> None:
    assert Body(price=45000).price == Decimal("45000.0")
    assert Body(price="12.50").price == Decimal("12.5")
    assert Body(price=None).price is None


def test_money_rejects_invalid_values() -> None:
    assert _message(price="abc") == "precio inválido"
    assert _message(price=1.234) == "precio inválido"
    assert _message(price=True) == "precio inválido"
    assert _message(price=-1) == "precio negativo"


def test_integer_validation() -> None:
    assert Body(stock="5").stock == 5
    assert _message(stock=1.5) == "stock entero"
    assert _message(stock=-1) == "stock negativo"
