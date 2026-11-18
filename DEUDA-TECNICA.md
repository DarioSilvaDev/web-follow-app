# Deuda técnica — Frontend (web-follow-app)

> Registro de pendientes explícitos del frontend. Fechas en formato
> `YYYY-MM-DD`. Este archivo NO reemplaza decisiones de producto: lo que
> requiere decisión de PO/Tech Lead se marca como tal.

---

## 2026-10-29 — Bug QA: "Exhibición" stale tras alta de vehículo en contexto DEALERSHIP

Contexto: dueño de concesionaria (sin vehículos) → `/dealerships/[id]` →
"Registrar vehículo" → `/vehicles/new` (contexto DEALERSHIP, exige
kilometraje) → alta → redirect al detalle → la tab **Exhibición** seguía
mostrando el estado vacío **hasta un F5**.

Causa: el success de `/vehicles/new` solo invalidaba `["vehicles"]`; la
exhibición se leía con una clave plana propia (`["dealership-vehicles",
dealershipId]`, `dealership-exhibition-section.tsx`), que no compartía
prefijo. Con `staleTime: 30_000`, si la tab se había visitado <30s antes la
query seguía "fresh" y el detalle remontaba sin refetch (el F5 recrea el
`QueryClient`).

Fix aplicado (primera iteración): invalidación explícita de la clave plana de
exhibición en el success del alta cuando el contexto activo es DEALERSHIP
(misma lectura de `getActiveContext()` que ya decidía el redirect). Se descartó
`invalidateQueries()` global: dispararía refetches de catálogo, admin y demás
queries ajenas al alta.

> **Actualizado 2026-10-29 (unificación de queries de vehículos):** la clave
> plana y las invalidaciones ad-hoc fueron reemplazadas por
> `src/lib/query-keys.ts` (`vehicleKeys` + `invalidateVehicleViews`). La
> exhibición ahora es `vehicleKeys.dealershipExhibition(id)` =
> `["vehicles", "dealership", id]`, jerárquica bajo `["vehicles"]`. Ver la
> sección "D-021 (parcial) + unificación de query keys" más abajo. Las
> referencias a `["dealership-vehicles", id]` que quedan en este documento son
> **históricas** (describen el estado anterior al refactor).

### Tests

- [x] Regresión del fix: `/vehicles/new` en DEALERSHIP invalida la vista de
  exhibición (hoy: `invalidateVehicleViews` ⇒ `["vehicles"]`, que por jerarquía
  cubre `["vehicles", "dealership", "d1"]`) + redirect a `/dealerships/d1`; en
  PERSONAL se mantiene el comportamiento. Implementado en
  `vehicles/new/__test__/vehicle-register-form.test.tsx` (aserción actualizada
  al refactor).
- [x] `DealershipExhibitionSection.onMutationEnd` (Vender / Devolver) ahora
  invalida `invalidateVehicleViews(queryClient)` — ver "Hallazgos de auditoría
  de invalidaciones" abajo (test de regresión pendiente).
- [x] `/transfer/qr/[token]` (confirmar QR) ahora invalida las queries del
  resultado — ver "Hallazgos de auditoría de invalidaciones" abajo.

### Hallazgos de auditoría de invalidaciones

Mismo patrón "mutación OK pero la lista destino no se invalida (o se invalida
una clave que no existe) → queda stale por el `staleTime` de 30s".

#### Corregidos (2026-10-29)

- [x] MEDIA — `create-dealership-form.tsx:107` invalidaba `["dealerships"]`
  (clave que no existe y que no matchea por prefijo la real,
  `["dealerships-mine"]`) → ahora invalida `["dealerships-mine"]`, la clave del
  listado
  (`dealerships/page.tsx:33`). `["dealership", id]` NO se agrega: entidad
  nueva, sin cache previo (verificado en `dealerships/[id]/page.tsx:41`).
  **Test de regresión pendiente:** `CreateDealershipForm` no tiene `__test__`
  (crear suite nueva excede este fix). Caso a cubrir: alta → invalida
  `["dealerships-mine"]` y `router.push("/dealerships/{id}")`.
- [x] MEDIA — `dealership-exhibition-section.tsx:218` (`onMutationEnd` de
  Vender/Devolver) ahora llama a `invalidateVehicleViews(queryClient)`
  (`["vehicles"]`), que por prefijo cubre tanto `/vehicles` como la propia
  exhibición `["vehicles", "dealership", dealershipId]`. En contexto
  DEALERSHIP `GET /vehicles` devuelve el mismo conjunto (D-TL-19,
  `list-vehicles.handler.ts:53`) ⇒ `/vehicles` ya no queda mostrando un
  vehículo vendido/devuelto. **Test de regresión pendiente:** el test de la
  sección mockea `QrTransferPanel` a `null`
  (`dealership-exhibition-section.test.tsx:25`); invocar `onMutationEnd`
  requiere exponer el callback en el mock (no trivial).
- [x] MEDIA — `app/transfer/qr/[token]/page.tsx:216-235`: al confirmar el QR
  se llama a `invalidateVehicleViews(queryClient)` (`["vehicles"]`, cubre
  listado, dashboard, transferencias y exhibiciones), se invalida
  `vehicleKeys.detail(preview.vehicle.id)` (por prefijo: detalle, historial,
  fotos y documentos) y, en flujos de concesionaria, la exhibición de origen
  (`sale`/`return`) y/o la receptora (`take`) con
  `vehicleKeys.dealershipExhibition(id)`. El endpoint
  (`POST vehicles/transfer/qr/:token/accept`) devuelve solo
  `{ transferId, status }` (`TransferQrAcceptResult`, `types/vehicle.ts:309`),
  así que la concesionaria de origen sale del **preview**
  (`preview.fromDealership`, `types/vehicle.ts:305`) y la receptora del estado
  local que ya se usa para el header `X-Context-*`. NO se invalida
  `["dealership", id]`: el detalle muestra nombre/razón social/CUIT/estado,
  no vehículos. **Test:** extendido en `qr-accept-page.test.tsx` (el test de
  aceptación verifica `["vehicles"]` + `["vehicle", "v1"]`, y que un QR
  persona→persona no invalida la exhibición de concesionaria); el render pasó
  a envolverse en `QueryClientProvider` porque la página ahora usa
  `useQueryClient`.
- [x] MEDIA — `atenciones/nueva/page.tsx:212-222`: tras crear el CareEpisode
  invalida `["care-episode-list", workshopId]` (prefijo ⇒ cubre cualquier
  página cacheada; clave real en `atenciones/page.tsx:125`) y
  `["vehicle", vehicleId, "history"]` (clave real en
  `vehicles/[id]/page.tsx:489`). Guard `if (workshopId)` porque el tipo es
  `string | null` (en render ya se garantiza no-null). **Test:** extendido en
  el happy path de `new-care-episode-page.test.tsx`.
- [x] BAJA — `workshop-profile-form.tsx:146`: el guardado invalida además
  `["workshops-mine"]` (el listado muestra el nombre,
  `workshops/page.tsx:32`). **Test de regresión pendiente:**
  `WorkshopProfileForm` no tiene `__test__` (crear suite nueva excede este
  fix). Caso a cubrir: guardar → invalida `["workshop", id]` y
  `["workshops-mine"]`.

#### Verificados sin acción

- [x] `dealerships/nueva` → detalle no invalida `["dealership", id]`: es una
  entidad nueva, no hay cache previo.
- [x] `["dealership", id]` en el flujo de QR: el detalle
  (`dealerships/[id]/page.tsx`) no lista vehículos, solo datos de la entidad.

#### Drift preexistente detectado al correr lint (no corregido)

- [ ] `app/transfer/qr/[token]/page.tsx:168` — `react-hooks/set-state-in-effect`
  (`setDealershipId(activeContext.dealershipId)` dentro de `useEffect`). Ya
  estaba en `HEAD` (verificado linteando la versión de `HEAD`); corregirlo
  implica cambiar cómo se pre-selecciona la concesionaria en `take`
  (comportamiento del flujo QR) ⇒ fuera del alcance de un fix de invalidación.

Nota estructural (resuelta el 2026-10-29): en contexto DEALERSHIP, `/vehicles`
y la tab Exhibición son dos vistas del mismo conjunto. Antes vivían en claves
sin prefijo común (`["vehicles", …]` vs `["dealership-vehicles", id]`), que era
la causa raíz de esta clase de bug. Hoy ambas viven bajo el prefijo
`["vehicles"]` (`src/lib/query-keys.ts`) y las mutaciones invalidan con
`invalidateVehicleViews`. Ver "D-021 (parcial) + unificación de query keys".

### Evaluación de arquitectura pendiente (sin compromiso)

- [ ] **Server Actions + `revalidateTag` + listado en RSC** (propuesta PO para
  este tipo de bug): es una migración transversal del data layer, no un fix
  puntual. `revalidateTag` no toca el cache de react-query y el contexto activo
  vive en memoria del cliente. Requiere decisión de arquitectura (ADR) y
  coordinación con backend; **no** se adopta para un solo flujo.

---

## 2026-10-29 — D-021 (parcial): persistencia del contexto activo + unificación de query keys de vehículos

Dos cambios aprobados por PO, sin tocar backend ni contratos.

### 1. D-021 — persistencia del contexto activo en `sessionStorage` (alcance UX)

Problema: el contexto activo vivía solo en memoria. En rutas no-detalle
(`/vehicles/new`, listados, dashboard) un F5 lo perdía y la app caía a
PERSONAL en silencio: en un flujo de concesionaria el alta se guardaba a
nombre personal.

Diseño aplicado (`src/lib/active-context.ts`):

- **Almacenamiento:** `sessionStorage` (no `localStorage`): es por-pestaña y
  muere al cerrarla, así no filtra el contexto entre usuarios en equipos
  compartidos (caso taller) ni entre pestañas con sesiones distintas.
- **Clave versionada:** `autentia:active-context:v1`
  (`ACTIVE_CONTEXT_STORAGE_KEY`). Cambiar la versión invalida el payload viejo.
- **Payload mínimo:** `{ type: "WORKSHOP" | "DEALERSHIP", id }`. Nunca datos
  de usuario, permisos ni tokens (D-001: sesión 100% cookie httpOnly).
- **Tolerancia:** JSON inválido, shape desconocido o claves de otra versión del
  mismo namespace (`autentia:active-context:*`) se descartan y se eliminan al
  hidratar; `sessionStorage` bloqueado/SSR degrada a store en memoria.
- **SSR/hidratación:** el módulo se evalúa también en el server (sin storage ⇒
  `null`) y se hidrata en el cliente al importarse. `useActiveContext` usa
  `getActiveContextServerSnapshot()` → `null`, así el markup SSR es PERSONAL y
  React re-renderiza con el valor persistido sin hydration mismatch.
- **Persistencia:** `selectWorkshop`, `selectDealership`, `clearWorkshop`,
  `clearDealership` y `clearActiveContext` escriben/remueven el storage. La API
  pública del store no cambió.
- **Precedencia:** ruta explícita > contexto persistido > PERSONAL.
- **Guard de membresía:** `contextBelongsToSession(context, user)` en
  `src/hooks/use-route-derived-context.ts` valida el contexto vigente en
  **cualquier** ruta (no solo detalles), así un contexto persistido de una
  membresía revocada (o de otro usuario en la misma pestaña) se limpia antes de
  seguir emitiendo `X-Context-*`. No limpia ni setea con `status === "loading"`
  (evita clears falsos durante el bootstrap) y limpia en `unauthenticated`.
- **Limpieza:** logout (`src/lib/api.ts:376`, `.finally` de `authApi.logout`),
  refresh fallido (`src/lib/api.ts:279`) y guard de membresía.
- **El flujo QR conserva su comportamiento:** `selectDealership` en
  `/transfer/qr/[token]` persiste el contexto y el backend valida la membresía
  al confirmar (RB-02).

Esto **no es una frontera de seguridad**: el backend re-valida la membresía en
cada request (`ContextResolver` ⇒ 403 si el contexto no corresponde). El
storage solo recuerda la selección UX.

Riesgo residual (403, aceptado): entre la hidratación del contexto persistido y
el primer run del guard (antes de que `/auth/me` resuelva) la app puede emitir
requests con un `X-Context-Id` que el backend rechace con 403 si la membresía
fue revocada. Es un falso negativo de UX, no un bypass; se corrige solo al
cargar la sesión. No se agregó bloqueo de requests durante `loading` para no
cambiar el comportamiento de arranque.

Fuera de alcance (D-021 sigue abierto en su alcance amplio):

- [ ] persistencia entre reinicios del navegador (`localStorage`);
- [ ] sincronización multi-pestaña (evento `storage`);
- [ ] contexto/sesión server-side (cookie httpOnly u homólogo).

#### Tests pendientes (D-021) — no se crean en este cambio (decisión PO)

- [ ] `active-context`: `selectWorkshop`/`selectDealership` escriben
  `autentia:active-context:v1` con el payload mínimo; `clear*` lo remueven;
  `null` no deja clave.
- [ ] Hidratación tolerante: JSON inválido se descarta y se remueve; shape
  inválido (sin `id`, `type` desconocido) ídem; clave de versión anterior se
  poda; `sessionStorage` que lanza no rompe el store.
- [ ] `useActiveContext`: snapshot de servidor `null` (sin hydration mismatch) y
  re-render con el valor persistido en cliente.
- [ ] Guard: contexto persistido sin membresía se limpia en ruta **no-detalle**
  (ej. `/vehicles/new`); con `status === "loading"` no limpia ni setea; en
  `unauthenticated` limpia; ruta detalle con membresía válida setea.
- [ ] Cambio de usuario en la misma pestaña: tras logout o refresh fallido, el
  siguiente login no hereda WORKSHOP/DEALERSHIP.
- [ ] Flujo QR: `selectDealership` persiste y el contexto sobrevive a la
  navegación posterior.

### 2. Unificación de query keys de vehículos

Problema: en contexto DEALERSHIP, `/vehicles` y la tab Exhibición son dos
vistas del mismo conjunto (mismo `GET /vehicles`, D-TL-19) pero vivían en
claves sin prefijo común; cada mutación debía recordar invalidar la clave
plana correcta y olvidarla dejaba la vista stale por `staleTime` (bug QA de
"Exhibición" vacía hasta F5).

Diseño aplicado (`src/lib/query-keys.ts`, nuevo):

- `vehicleKeys.all` = `["vehicles"]`
- `vehicleKeys.lists()` = `["vehicles","list"]`
- `vehicleKeys.list({ page, limit, q })` = `["vehicles","list",page,limit,q ?? ""]`
- `vehicleKeys.dashboard()` = `["vehicles","dashboard"]`
- `vehicleKeys.transfersOwned()` = `["vehicles","transfers","owned"]`
- `vehicleKeys.dealershipExhibition(id)` = `["vehicles","dealership",id]`
- `vehicleKeys.detail(id)` = `["vehicle",id]` (namespace **singular**: es la
  entidad individual, no una vista del conjunto)
- `invalidateVehicleViews(queryClient)` = `invalidateQueries({ queryKey:
  vehicleKeys.all })`

Se **unifica el namespace y la invalidación, no el fetch ni el DTO**: la
exhibición conserva su shape acotado. El prefijo `["vehicles"]` también
matchea `transfersOwned()` (`["vehicles","transfers","owned"]`); es
intencional y quedó documentado en el módulo. `detail` no se invalida desde el
helper: cada mutación conoce el id y lo invalida explícitamente.

Sitios migrados al helper / a las factories:

- `src/app/(dashboard)/vehicles/new/page.tsx:115` (alta)
- `src/app/(dashboard)/vehicles/page.tsx:51` (listado)
- `src/app/(dashboard)/dashboard/page.tsx:38` (resumen)
- `src/app/(dashboard)/vehicles/[id]/edit/page.tsx:180-181,253-254` (edición)
- `src/app/(dashboard)/vehicles/[id]/page.tsx:196,467-490,640-671` (detalle,
  fotos, documentos, historial)
- `src/components/dealership/dealership-exhibition-section.tsx:91,218`
  (lectura de exhibición + Vender/Devolver)
- `src/app/(dashboard)/transferencias/page.tsx:485,507` (candidatos +
  aceptación)
- `src/app/transfer/qr/[token]/page.tsx:216-235` (confirmación de QR)
- `src/components/transfer/transfer-dialog.tsx:341,359,373` (transferencias)
- `src/components/vehicle/photos-section.tsx:63` y
  `src/components/vehicle/documents-section.tsx:123` (subclaves de detalle)

Tests: solo se actualizaron aserciones de claves en
`vehicles/new/__test__/vehicle-register-form.test.tsx`,
`transfer/qr/[token]/__test__/qr-accept-page.test.tsx` y
`transferencias/__test__/transferencias-page.test.tsx` (no se agregaron cases
nuevos).

#### Tests pendientes (query keys) — deuda

- [ ] `query-keys`: shape de cada factory (incluido `q` vacío ⇒ `""`) y que
  `invalidateVehicleViews` invalide exactamente `{ queryKey: ["vehicles"] }`.
- [ ] Regresión: mutación de vehículo (alta/edición/vender) invalida la
  exhibición de la concesionaria sin F5 — hoy cubierto indirectamente por la
  aserción de `["vehicles"]` en el alta y en el QR.

Fuera de alcance: no se tocaron las claves de otros dominios (`workshops`,
`admin-*`, `care-episode*`, `transfers`, `dealerships-mine`). Tampoco se cambió
el comportamiento de foto/documento: `photos-section` y `documents-section`
siguen invalidando solo su subclave de detalle, así que un cambio de foto puede
dejar el thumbnail de la Exhibición stale hasta `staleTime` (30s) — gap
preexistente, no introducido por este refactor.

---

## 2026-10-28 — Navegación/contexto: cambio de UX (reemplazo del ContextSelector)

Contexto: se reemplazó el `ContextSelector` (select en el header) por
navegación por secciones + `ContextChip` + contexto derivado de ruta
(`useRoute-derived-context`: `/dealerships/<uuid>` y `/workshops/<uuid>`
activan contexto con guard de membresía). Decisión de UX/PO aplicada;
la persistencia de contexto (**D-021**) quedó **parcialmente resuelta** el
2026-10-29 (sessionStorage por-pestaña; ver sección siguiente). Antes de ese
cambio el contexto vivía solo en memoria: en rutas detalle el F5 sí lo
recuperaba (el hook lo re-deriva desde la URL) y en el resto se perdía.

### Tests nuevos pendientes (decisión PO: no se crean en este cambio)

- [ ] `use-route-derived-context` (hook): matriz de rutas — `[id]` de
  concesionaria/taller setea el contexto; listas/dashboard/vehicles/transfer
  no alteran el contexto; id sin membresía en sesión ⇒ `clearActiveContext`;
  sesión `loading` no limpia; `/dealerships/nueva` no matchea (regex UUID).
- [ ] Página `/workshops` (listado): estados loading / lista / vacío / 403
  (deep-link sin membresía activa) / error + Reintentar.
- [ ] Guard de membresía en `/atenciones*` (listado, nueva, verificaciones):
  sesión cargada sin `workshopMemberships` ⇒ `router.replace("/dashboard")`;
  durante `loading` NO redirige; copy condicional sin membresías.
- [ ] Dashboard quick actions por contexto: PERSONAL vs WORKSHOP vs
  DEALERSHIP (Ver vehículos / Miembros `?tab=members`).

### Tests existentes a ampliar

- [ ] `/vehicles/new`: redirect contextual — con DEALERSHIP activo al
  registrar, `router.push("/dealerships/{id}")` (hoy solo se cubre el
  redirect PERSONAL → `/vehicles`).
- [ ] `DealershipExhibitionSection`: empty state con CTA "Registrar
  vehículo" (`registerHref`) — hoy solo se cubre el texto del estado.
- [ ] `ContextChip`: render con contexto activo / no render en PERSONAL /
  ✕ dispara `clearActiveContext` y, en ruta detalle del contexto limpiado,
  navega al listado (`/dealerships` o `/workshops`) (hoy solo cobertura
  básica vía `dashboard-layout.test`).
- [ ] Navbar: orden de items y condiciones por membresía (Concesionarias /
  Talleres / Administración) — cobertura mínima actual en
  `dashboard-layout.test`; falta matrix por rol admin y deep-link
  `aria-current` en subrutas (`/dealerships/<id>` marca Concesionarias
  con `aria-current="true"`, no `"page"`).

### Decisión abierta (PO)

- [~] **D-021 — persistencia del contexto activo** (sessionStorage u
  otro): **parcialmente resuelta (2026-10-29)** con `sessionStorage`
  por-pestaña. Histórico: en este cambio no se implementó storage por
  decisión explícita, porque en rutas detalle (`/dealerships/<uuid>`,
  `/workshops/<uuid>`) el F5 ya recuperaba el contexto vía
  `useRouteDerivedContext`; se perdía en el resto (listados, dashboard,
  `/vehicles/new`, etc.). Caso crítico que disparó la resolución: F5 en
  `/vehicles/new` dentro de un flujo de concesionaria ⇒ el registro
  procedía en contexto PERSONAL y guardaba el vehículo a nombre personal en
  silencio. Ver "D-021 (parcial) + unificación de query keys" (arriba) para
  el alcance cubierto y lo que sigue abierto.
- [ ] `?tab=members` en `/dealerships/[id]` es `defaultValue` uncontrolled
  (deep-link inicial únicamente); hacerlo controlado si se necesita que
  el nav del dashboard actualice la tab sin remontar la página.

### Drifts preexistentes corregidos en este cambio (suite roja en `development`)

- [x] `login-page.test`: el mock de `useRouter` no exponía `replace` (la
  página migro de `push` a `replace` en el hardening de open redirect) y
  `refreshSession` se resolvía `undefined` (el contrato actual devuelve el
  usuario o null). Mocks alineados con la implementación actual.
- [x] `vehicle-edit-form.test`: "Año de fabricación" fue removido del form
  de edición (campo comentado en la página) pero los tests aún lo
  esperaban. Prefill validado sobre campos visibles; D-043 revalidado
  sobre `modelYear`.
