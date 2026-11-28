# Plan — Home del taller + onboarding

> Estado: `IN PROGRESS`
> Fecha: 2026-11-27
> Rama: `feat/workshop-home-onboarding`
> Prototipo: [`docs/prototypes/workshop-resumen-onboarding.html`](../prototypes/workshop-resumen-onboarding.html)

---

## 1. Problema

Los usuarios que pertenecen a un taller (por lo general uno solo) entran a la
plataforma a **prestar servicios**, pero hoy tienen que:

```text
menú → /workshops (lista) → /workshops/[id] → tab "Datos"
```

Eso son 2-3 pasos de más, y el tab por defecto (`Datos`) es un formulario de
configuración, no el tablero de trabajo.

La propuesta original ("home = talleres para usuarios con taller") mezclaba
**identidad** (tengo membresía) con **contexto** (estoy operando como taller) y
chocaba con D-020/D-021. Este plan resuelve la fricción real (**time-to-task**)
sin romper el modelo de Active Context.

---

## 2. Decisiones que se respetan

- **D-020** — Contexto inválido ⇒ `403 INVALID_CONTEXT`, sin fallback silencioso.
- **D-021** — Active Context sesión/ruta-driven. La membresía **no** es fuente
  de contexto; el redirect usa una ruta explícita (`/workshops/<id>`).
- **D-019** — `GET /vehicles` en WORKSHOP todavía no está scopeado al taller:
  no se muestra "vehículos del taller" en esta iteración.
- **D-024** — No elegir el "primer taller" en silencio cuando hay varios.
- **Vehicle-first** se mantiene para el contexto PERSONAL.

---

## 3. Alcance

### Fase 1 — Nav directo al taller único

- `buildNavSections` recibe `singleWorkshopId?: string`.
- Si hay exactamente 1 membresía activa:
  - label: **"Mi taller"**;
  - href: `/workshops/<id>`.
- Si hay 0 o ≥2: se mantiene `/workshops` y label "Talleres".
- `isNavItemActive` ya matchea por prefijo: `/workshops/<id>` queda activo.
- No se toca `useRouteDerivedContext` ni `active-context.ts`: entrar a
  `/workshops/<id>` ya activa WORKSHOP por ruta.

**Guardrails**

- Impersonación: no forzar destino.
- Membresía revocada / taller `pending_claim`: no redirigir.
- Varios talleres: lista como selector (nunca `[0]`).

### Fase 2 — Tab "Resumen" operativo en `/workshops/[id]`

- Default tab: `resumen` (hoy `datos`).
- Tabs: **Resumen · Datos · Sucursales · Especialidades**.
- Resumen:
  - KPIs: atenciones abiertas, verificaciones pendientes, turnos de hoy
    (solo si hay fuente; si no, omitir).
  - "Atenciones recientes" (`careEpisodeApi.listCareEpisodes({ limit: 5 })`).
  - "Primeros pasos del taller" reutilizando `WorkshopCompletenessCard`.
  - Quick actions existentes (Registrar servicio, Ver atenciones,
    Verificaciones, Reclamos).
- Role-gating con el gate que ya usa la página (`canInWorkshop` / `useAuth`).
- Estados: loading, error, vacío, 403, 404.

### Fase 3 — Onboarding con Driver.js

- `npm i driver.js` (1.x).
- Checklist "Primeros pasos" con `completeWhen` derivado del estado real.
- Tours **bajo demanda** (nunca auto-start en cada login):
  - owner/admin: datos → sucursal → especialidades;
  - recepcionista: registrar una atención;
  - técnico: verificaciones.
- Targets con `data-tour` estables.
- Persistencia: `autentia:onboarding:v1:<userId>:<workshopId>` (localStorage).
- A11y: `focus`, Escape, `prefers-reduced-motion`, mobile con tours cortos.

### Fase 4 — Redirect post-login (opcional)

- `resolvePostLoginPath(user, next)`:
  - `?next=` seguro manda;
  - si no, **exactamente un** taller activo ⇒ `/workshops/<id>`;
  - varios o impersonación ⇒ `/dashboard`.
- No setear contexto imperativamente: el redirect usa ruta explícita.

### Fase 5 — Métricas y rollout

- `onEvent` del checklist → analytics (si existe infra).
- Métricas: % que completa sucursal, tiempo a primera atención, drop-off por
  paso, tickets de soporte.
- Rollout interno primero.

---

## 4. Archivos afectados

| Fase | Archivo | Cambio |
|---|---|---|
| 1 | `src/components/layout/nav-config.ts` | `singleWorkshopId`, label/href |
| 1 | `src/app/(dashboard)/layout.tsx` | calcular membresía única |
| 1 | `src/components/layout/__test__/mobile-nav-drawer.test.tsx` | actualizar |
| 1 | `src/components/layout/__test__/nav-config.test.ts` | nuevo |
| 2 | `src/app/(dashboard)/workshops/[id]/page.tsx` | default `resumen` + tab |
| 2 | `src/components/workshop/workshop-overview-section.tsx` | nuevo |
| 2 | `src/components/workshop/workshop-kpi-cards.tsx` | nuevo (o inline) |
| 2 | `src/components/workshop/workshop-completeness-card.tsx` | reusar |
| 3 | `src/lib/onboarding/storage.ts` | nuevo |
| 3 | `src/lib/onboarding/tours.ts` | nuevo |
| 3 | `src/components/onboarding/workshop-setup-checklist.tsx` | nuevo |
| 3 | `src/components/onboarding/use-tour.ts` | nuevo |
| 3 | targets `data-tour` | taller, especialidades, atenciones |
| 4 | `src/lib/auth-redirect.ts` | nuevo |
| 4 | `src/app/(auth)/login/page.tsx` | usar el helper |

---

## 5. Tests

- **Fase 1**
  - `buildNavSections` con 0, 1 y N talleres (label + href).
  - `mobile-nav-drawer` sigue renderizando los links.
- **Fase 2**
  - La página abre en `resumen`.
  - CTAs visibles/ocultos según rol.
  - Empty state sin atenciones.
  - Error 403/404.
- **Fase 3**
  - Lógica pura del checklist (`completeWhen`).
  - El tour se monta y dispara con `driver` mockeado.
- **Fase 4**
  - 1 taller, varios, sin taller, `?next=` QR, impersonación.

---

## 6. Criterios de aceptación

- Usuario con 1 taller llega a su taller en **1 click** desde el shell.
- Usuario con N talleres ve la lista (no se elige uno arbitrariamente).
- El detalle abre en un tablero operativo, no en el formulario de datos.
- El onboarding guía sin bloquear y se puede repetir.
- No se rompe PERSONAL ni el garage personal del usuario híbrido.
- `npm run test`, `npm run lint`, `npm run build` en verde.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Selectores frágiles del tour | `data-tour` + pasos tolerantes a targets ausentes |
| Checklist duplicada | Una sola fuente: `getWorkshopCompleteness` |
| Contexto implícito | Solo redirect a ruta explícita; nunca auto-set |
| Multi-taller | Lista/selector, nunca `[0]` |
| Mobile | Tours cortos o solo checklist |
| Membresía revocada | Validar contra `workshopMemberships` de la sesión |

---

## 8. Prototipo

`docs/prototypes/workshop-resumen-onboarding.html` — HTML estático navegable:

- sidebar con "Mi taller";
- tab Resumen con KPIs, atenciones y checklist;
- tabs Datos / Sucursales / Especialidades;
- tour de 3 pasos tipo Driver.js con spotlight, progreso y "Repetir tour";
- responsive.

No toca la app ni el backend; sirve para validar IA y flujo antes de codear.
