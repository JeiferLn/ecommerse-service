"""Validadores con mensajes en español: el admin muestra el `message` del error tal cual."""

import math
import re
from collections.abc import Callable, Iterable
from decimal import Decimal
from typing import Any

from pydantic import AfterValidator, BeforeValidator
from sqlalchemy.exc import IntegrityError

from app.core.schemas import MissingText

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def text(
    *,
    min_len: int | None = None,
    max_len: int | None = None,
    min_msg: str | None = None,
    max_msg: str | None = None,
    trim: bool = False,
) -> AfterValidator:
    def check(value: str) -> str:
        if trim:
            value = value.strip()
        if min_len is not None and len(value) < min_len:
            raise ValueError(min_msg or f"Debe tener al menos {min_len} caracteres")
        if max_len is not None and len(value) > max_len:
            raise ValueError(max_msg or f"No puede exceder {max_len} caracteres")
        return value

    return AfterValidator(check)


def is_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(value.strip()))


def email(message: str = "Ingresa un email válido") -> AfterValidator:
    def check(value: str) -> str:
        if not is_email(value):
            raise ValueError(message)
        return value

    return AfterValidator(check)


def string(message: str) -> BeforeValidator:
    """`@IsString()`: rechaza cualquier valor que no sea texto (sin coerción)."""

    def check(value: Any) -> Any:
        if value is not None and (not isinstance(value, str) or isinstance(value, MissingText)):
            raise ValueError(message)
        return value

    return BeforeValidator(check)


def boolean(message: str) -> BeforeValidator:
    """`@IsBoolean()`: solo `true`/`false` de JSON."""

    def check(value: Any) -> Any:
        if value is not None and not isinstance(value, bool):
            raise ValueError(message)
        return value

    return BeforeValidator(check)


def matches(pattern: str, message: str, flags: int = 0) -> AfterValidator:
    """`@Matches(regex)`."""
    compiled = re.compile(pattern, flags)

    def check(value: str) -> str:
        if not compiled.search(value):
            raise ValueError(message)
        return value

    return AfterValidator(check)


def one_of(values: Iterable[str], message: str) -> BeforeValidator:
    allowed = set(values)

    def check(value: Any) -> Any:
        if value not in allowed:
            raise ValueError(message)
        return value

    return BeforeValidator(check)


def int_range(
    *, minimum: int | None = None, maximum: int | None = None, message: str | None = None
) -> AfterValidator:
    def check(value: int) -> int:
        if minimum is not None and value < minimum:
            raise ValueError(message or f"Debe ser mayor o igual a {minimum}")
        if maximum is not None and value > maximum:
            raise ValueError(message or f"Debe ser menor o igual a {maximum}")
        return value

    return AfterValidator(check)


def _to_number(value: Any) -> float | None:
    """`@Type(() => Number)` de class-transformer: acepta números y strings numéricos."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        number = float(value)
    elif isinstance(value, str) and value.strip():
        try:
            number = float(value)
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def money(invalid_msg: str, negative_msg: str) -> BeforeValidator:
    """`@IsNumber({ maxDecimalPlaces: 2 })` + `@Min(0)` → `Decimal`."""

    def check(value: Any) -> Any:
        if value is None:
            return None
        number = _to_number(value)
        if number is None:
            raise ValueError(invalid_msg)
        amount = Decimal(str(number))
        exponent = amount.normalize().as_tuple().exponent
        if isinstance(exponent, int) and exponent < -2:
            raise ValueError(invalid_msg)
        if amount < 0:
            raise ValueError(negative_msg)
        return amount

    return BeforeValidator(check)


def integer(invalid_msg: str, *, minimum: int | None = None, min_msg: str | None = None) -> BeforeValidator:
    """`@IsInt()` (+ `@Min`) con conversión de strings numéricos."""

    def check(value: Any) -> Any:
        if value is None:
            return None
        number = _to_number(value)
        if number is None or not number.is_integer():
            raise ValueError(invalid_msg)
        if minimum is not None and number < minimum:
            raise ValueError(min_msg or invalid_msg)
        return int(number)

    return BeforeValidator(check)


def custom(check: Callable[[Any], Any]) -> AfterValidator:
    return AfterValidator(check)


def is_unique_violation(error: Exception) -> bool:
    if not isinstance(error, IntegrityError):
        return False
    orig = getattr(error, "orig", None)
    code = getattr(orig, "sqlstate", None) or getattr(getattr(orig, "__cause__", None), "sqlstate", None)
    return code == "23505" or "UniqueViolation" in type(getattr(orig, "__cause__", orig)).__name__
