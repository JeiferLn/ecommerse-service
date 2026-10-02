from decimal import Decimal


def num(value: Decimal | int | float) -> int | float:
    """Como `Number(decimal)` en JS: los enteros se serializan sin `.0`."""
    number = float(value)
    return int(number) if number.is_integer() else number


def num_or_none(value: Decimal | int | float | None) -> int | float | None:
    return None if value is None else num(value)
