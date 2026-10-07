from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router
from app.modules.categories.router import router as categories_router
from app.modules.companies.router import router as companies_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.health.router import router as health_router
from app.modules.knowledge.router import router as knowledge_router
from app.modules.orders.checkout_router import router as checkout_router
from app.modules.orders.router import router as orders_router
from app.modules.payments.router import router as payments_router
from app.modules.platform.router import router as platform_router
from app.modules.products.router import router as products_router
from app.modules.whatsapp.router import admin_router as admin_whatsapp_router
from app.modules.whatsapp.router import inbox_router as whatsapp_inbox_router
from app.modules.whatsapp.router import meta_cloud_test_router, playground_router
from app.modules.whatsapp.router import router as whatsapp_router

routers: list[APIRouter] = [
    health_router,
    auth_router,
    companies_router,
    dashboard_router,
    billing_router,
    categories_router,
    products_router,
    knowledge_router,
    orders_router,
    checkout_router,
    payments_router,
    whatsapp_router,
    whatsapp_inbox_router,
    playground_router,
    admin_whatsapp_router,
    meta_cloud_test_router,
    platform_router,
]
