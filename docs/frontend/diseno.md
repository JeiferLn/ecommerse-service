# Diseño del admin (Fase 12)

## Layout

- Toda página de la tienda usa `PageHeader` (título + descripción + acción principal) dentro del layout `(company)`: sidebar en desktop y `MobileNav` en móvil.
- Revisar siempre a 390 px.

## Primitivas (`components/ui/`)

`button`, `input`, `textarea`, `select`, `segmented`, `table`, `sheet` (panel lateral derecho), `dialog`, `dropdown-menu`, `badge`, `status-pill`, `empty-state`, `skeleton`, `card`, `separator`, `label`. No usar `<select>` nativo.

## Patrones compartidos

- `SetupRequirements` (`components/setup-requirements.tsx`): muestra todos los requisitos pendientes de una vez; no encadenar avisos uno por uno.
- `OnboardingChecklist` (overview) / `OnboardingSummary` (sidebar).
- `ChatMessageBubble` + `chat-interactive.tsx` para los chats (ver [Mensajes interactivos](../modulos/interactivos.md#admin)).
- `useFillHeight` para paneles a alto de viewport.

## Estilo

- Iconos solo de `lucide-react`; nada de emojis ni SVG sueltos.
- Animaciones con las clases de `globals.css` (`bubble-in`, `fade-swap`, `slide-up-in`), que respetan `prefers-reduced-motion`.
- Carga con `Skeleton` / `SkeletonText`, no con "Cargando…".

## Pendiente

- Quedan textos "Cargando…" en algunas pantallas.
- `window.confirm` en 6 lugares (billing, categorías, conocimiento, miembros, Mercado Pago, producto) que deben pasar a un diálogo de confirmación.
- No hay toasts para confirmar acciones.
