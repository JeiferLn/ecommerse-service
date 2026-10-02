from typing import Annotated, Any

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.core.db import DbSession
from app.core.errors import bad_request
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import AuthenticatedUser, require_roles
from app.core.validation import one_of
from app.modules.billing.service import BillingService, frontend_billing_return_url

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutBody(RequestModel):
    plan_code: Annotated[str, one_of(["pro", "business"], "Plan inválido")]
    interval: Annotated[str, one_of(["month", "year"], "Intervalo inválido")]


@router.get("/plans")
async def plans(session: DbSession) -> dict[str, Any]:
    return ok(await BillingService(session).list_public_plans())


@router.get("/mp-return")
async def mp_return(status: str | None = None, flow: str | None = None) -> RedirectResponse:
    """Retorno HTTPS para MP Preapproval en local (API_PUBLIC_URL/ngrok → frontend)."""
    return RedirectResponse(frontend_billing_return_url(status or "success", flow), status_code=302)


@router.get("/subscription")
async def subscription(
    session: DbSession,
    user: AuthenticatedUser = require_roles("owner", "manager", "user"),
) -> dict[str, Any]:
    if not user.company_id:
        raise bad_request("Selecciona una empresa activa")
    return ok(await BillingService(session).get_subscription_details(user.company_id))


@router.post("/checkout")
async def checkout(
    body: CheckoutBody, session: DbSession, user: AuthenticatedUser = require_roles("owner")
) -> dict[str, Any]:
    data = await BillingService(session).checkout(user.company_id, body.plan_code, body.interval, user.id)
    return ok(data, "Checkout iniciado")


@router.post("/cancel")
async def cancel(session: DbSession, user: AuthenticatedUser = require_roles("owner")) -> dict[str, Any]:
    data = await BillingService(session).cancel_at_period_end(user.company_id)
    return ok(data, "Renovación cancelada; mantienes acceso hasta el fin del periodo")
