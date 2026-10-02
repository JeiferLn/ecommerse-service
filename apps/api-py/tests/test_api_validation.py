"""Validación y envelope de errores: no tocan la base de datos."""

from fastapi.testclient import TestClient

from app.main import app
from app.modules.payments.connection_service import sign_state, verify_state

client = TestClient(app)


def test_unknown_route_uses_nest_message() -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json() == {"status": "error", "data": None, "message": "Cannot GET /api/v1/nope"}


def test_missing_fields_use_custom_messages() -> None:
    response = client.post("/api/v1/auth/login", json={})
    assert response.status_code == 400
    assert (
        response.json()["message"]
        == "Ingresa un email válido, La contraseña debe tener al menos 8 caracteres"
    )


def test_extra_fields_are_rejected() -> None:
    response = client.post("/api/v1/auth/login", json={"email": "a@b.co", "password": "12345678", "foo": 1})
    assert response.status_code == 400
    assert response.json()["message"] == "property foo should not exist"


def test_protected_route_requires_cookie() -> None:
    response = client.get("/api/v1/products")
    assert response.status_code == 401
    assert response.json()["message"] == "No autenticado"


def test_oauth_state_roundtrip_and_tamper() -> None:
    state = sign_state({"companyId": "c1", "userId": "u1", "exp": 9_999_999_999_999})
    assert verify_state(state)["companyId"] == "c1"
    body, _, sig = state.partition(".")
    try:
        verify_state(f"{body}x.{sig}")
    except ValueError:
        pass
    else:
        raise AssertionError("state alterado debería fallar")
