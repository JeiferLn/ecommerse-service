from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.errors import error_body

# 120 peticiones por minuto por IP, en memoria (no se comparte entre réplicas).
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])


async def rate_limit_exceeded(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(status_code=429, content=error_body("ThrottlerException: Too Many Requests"))


__all__ = ["RateLimitExceeded", "limiter", "rate_limit_exceeded"]
