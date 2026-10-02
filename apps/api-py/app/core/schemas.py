from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator
from pydantic.alias_generators import to_camel


class MissingText(str):
    """Marca de propiedad ausente: vale "" para los validadores de longitud, pero no es `@IsString`."""


class RequestModel(BaseModel):
    """Cuerpo de entrada: JSON en camelCase y sin campos extra (`property X should not exist`)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=False,
    )

    @model_validator(mode="before")
    @classmethod
    def _missing_text_as_empty(cls, data: Any) -> Any:
        """Un campo obligatorio ausente con validadores propios se valida como "" para devolver su
        mensaje en vez de un genérico "es obligatorio"."""
        if not isinstance(data, dict):
            return data
        filled = dict(data)
        for name, field in cls.model_fields.items():
            key = field.alias or name
            if field.is_required() and field.metadata and key not in filled and name not in filled:
                filled[key] = MissingText()
        return filled


class QueryModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
