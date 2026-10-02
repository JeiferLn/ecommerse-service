from typing import Any


def ok(data: Any = None, message: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"status": "success", "data": data}
    if message is not None:
        body["message"] = message
    return body
