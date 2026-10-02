import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class ApiError(Exception):
    """Error HTTP de la app: el handler la convierte al envelope de error."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def bad_request(message: str) -> ApiError:
    return ApiError(400, message)


def unauthorized(message: str = "No autenticado") -> ApiError:
    return ApiError(401, message)


def forbidden(message: str = "Forbidden resource") -> ApiError:
    return ApiError(403, message)


def not_found(message: str) -> ApiError:
    return ApiError(404, message)


def conflict(message: str) -> ApiError:
    return ApiError(409, message)


def service_unavailable(message: str) -> ApiError:
    return ApiError(503, message)


def error_body(message: str) -> dict[str, Any]:
    return {"status": "error", "data": None, "message": message}


def _validation_message(exc: RequestValidationError) -> str:
    # Las propiedades no permitidas se informan antes que los errores de cada campo.
    errors = sorted(exc.errors(), key=lambda error: error.get("type") != "extra_forbidden")
    parts: list[str] = []
    for error in errors:
        message = str(error.get("msg", "Valor inválido"))
        location = [str(item) for item in error.get("loc", ()) if item not in ("body", "query", "path")]
        field = ".".join(location)
        if error.get("type") == "value_error":
            # Mensaje propio del validador; en objetos anidados se antepone la ruta padre (`items.0.`).
            parent = ".".join(location[:-1])
            text = message.removeprefix("Value error, ")
            parts.append(f"{parent}.{text}" if parent else text)
            continue
        if error.get("type") == "extra_forbidden":
            parts.append(f"property {field} should not exist")
        elif error.get("type") == "missing":
            parts.append(f"{field} es obligatorio")
        else:
            parts.append(f"{field}: {message}" if field else message)
    return ", ".join(parts) or "Datos inválidos"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.message))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Error"
        if exc.status_code == 404 and message == "Not Found":
            message = f"Cannot {request.method} {request.url.path}"
        return JSONResponse(status_code=exc.status_code, content=error_body(message), headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content=error_body(_validation_message(exc)))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error no controlado", exc_info=exc)
        return JSONResponse(status_code=500, content=error_body("Error interno del servidor"))
