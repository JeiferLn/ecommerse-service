# Catálogo (Fase 3)

## Modelo

- Entidades: `Category`, `Product`, `ProductVariant`, `ProductImage`, aisladas por `companyId` (categoría/producto) o por producto.
- Categorías planas: `slug` único por empresa (`slugify` en backend).
- Variantes: cada producto tiene ≥1 variante; **precio y stock viven en la variante**. En el admin se pueden generar combinaciones desde atributos libres (talla, color, material, largo, etc.); siguen siendo N filas de inventario.

## API

- Endpoints bajo `/api/v1/categories` y `/api/v1/products`.
- Ajuste de inventario: `PATCH /products/:id/variants/:variantId/stock` con `stock` absoluto o `delta`.
- Reordenar imágenes: `PATCH /products/:id/images/reorder` con `{ imageIds: string[] }` (la primera es la portada).
- Autorización: lectura para miembros de la empresa; escritura `require_roles("owner", "manager")` / `canManageCatalog`.

## Imágenes

- `StorageService` (`app/core/storage.py`, `get_storage()`) usa Cloudflare R2 si hay `R2_*`. Si no (solo fuera de production), guarda en disco (`LOCAL_UPLOAD_DIR` o `./uploads`) y el API las sirve en `/uploads/...`.
- **URL guardada ≠ URL mostrada (disco local):** nunca devolver `ProductImage.url` tal cual.
  - Para el admin: `storage.browser_url(url)` (siempre `http://localhost:<PORT>`).
  - Para Twilio/WhatsApp: `storage.external_url(url)` (el `API_PUBLIC_URL` vigente, p. ej. ngrok).
  - Así un túnel caído o cambiado no rompe las imágenes ya guardadas. Con R2 ambas devuelven la URL pública sin cambios.

## Admin

`/categories`, `/products`, `/products/new`, `/products/[id]`.
