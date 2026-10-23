# HCDV — Frontend Decision Register

> Registro único de decisiones de producto, dominio, arquitectura y UX que condicionan la evolución del frontend de Historia Clínica Digital Vehicular (HCDV).

**Estado del documento:** Activo
**Última actualización:** 2026-10-02
**Alcance:** Frontend `web-follow-app` — MVP y decisiones estructurales que condicionan su evolución

> Las decisiones de backend, persistencia y contratos de base de datos se registran en `api-follow-app/DECISION-REGISTER.md`. Este registro **referencia** aquel, no lo duplica.

---

## 1. Propósito

Este documento mantiene el registro oficial de decisiones que afectan al frontend:

- experiencia de usuario y journeys;
- arquitectura de componentes y rutas;
- estado y fetching;
- contratos con el backend;
- autorización y presentación de permisos;
- deuda técnica conocida y su clasificación.

Su objetivo es evitar que decisiones importantes queden implícitas en código o en conversaciones entre agentes.

Una decisión registrada aquí debe considerarse **fuente de verdad**, salvo que exista una decisión posterior que la modifique o superseda.

---

## 2. Estados

| Estado       | Significado                                          |
| ------------ | ---------------------------------------------------- |
| `PROPOSED`   | Propuesta inicial pendiente de evaluación             |
| `PENDING`    | Requiere una decisión adicional antes de implementar  |
| `ACCEPTED`   | Decisión aprobada y aplicable                         |
| `REJECTED`   | Decisión explícitamente descartada                    |
| `SUPERSEDED` | Fue reemplazada por una decisión posterior            |

### Regla fundamental

Los agentes **NO deben implementar silenciosamente una decisión `PENDING`**.

Si una implementación requiere resolver una decisión pendiente, el agente debe:

1. identificar la decisión;
2. explicar por qué bloquea el trabajo;
3. proponer una resolución;
4. esperar aprobación cuando corresponda.

---

## 3. Jerarquía de fuentes de verdad

En caso de contradicción, utilizar el siguiente orden:

1. Decisiones `ACCEPTED` de `api-follow-app/DECISION-REGISTER.md`.
2. Decisiones `ACCEPTED` de este documento.
3. ADRs aceptados.
4. Product Blueprint / especificación funcional vigente.
5. `FRONTEND_BASELINE.md`.
6. `AGENTS.md` y documentación de agentes.
7. Código existente.
8. Suposiciones o convenciones.

El código existente **no prevalece automáticamente** sobre una decisión aceptada.

Cuando el código contradiga una decisión aceptada, debe considerarse legacy, bug o deuda técnica hasta determinar lo contrario.

---

## 4. Índice de decisiones

### Producto — Taller y sucursales

| ID      | Decisión                                                                 | Estado    |
| ------- | ------------------------------------------------------------------------ | --------- |
| PROD-001 | Auto-servicio "Mi taller" entra en el MVP                                  | `ACCEPTED` |
| PROD-002 | El dueño puede cargar y editar el CUIT libremente, con auditoría          | `ACCEPTED` |
| PROD-003 | Lectura para todos los miembros; edición por permiso, acción por acción   | `ACCEPTED` |
| PROD-004 | Checklist de completitud informativo; el bloqueo de sucursal se mantiene | `ACCEPTED` |
| PROD-005 | El nombre del taller es editable por el dueño, sin impacto en historial    | `ACCEPTED` |
| PROD-006 | El copy del wizard puede invitar a actualizar los datos luego             | `ACCEPTED` |

### Producto — Transferencia de vehículos

| ID      | Decisión                                                                        | Estado    |
| ------- | ------------------------------------------------------------------------------- | --------- |
| PROD-010 | Las vías de transferencia dependen del contexto activo de quien transfiere       | `ACCEPTED` |
| PROD-011 | No habilitar email/alias en contexto DEALERSHIP                                 | `ACCEPTED` |
| PROD-012 | Vender/Devolver permanece en la pantalla de concesionaria, no en el diálogo      | `ACCEPTED` |
| PROD-013 | Membresía de concesionaria en contexto PERSONAL no habilita la vía; se informa    | `ACCEPTED` |
| PROD-014 | El selector de contexto del header se acepta como transitorio                    | `ACCEPTED` |

### Arquitectura frontend

| ID     | Decisión                                                                                  | Estado    |
| ------ | ----------------------------------------------------------------------------------------- | --------- |
| FR-001  | Renderizar solo las opciones de transferencia aplicables al contexto                      | `ACCEPTED` |
| FR-002  | El gating por contexto vive en un helper único, puro y testeado                            | `ACCEPTED` |
| FR-003  | Una sola vía no renderiza selector; dos o más usan `Tabs` del design system                | `ACCEPTED` |
| FR-004  | Prohibido inferir autorización comparando `role.code` en el frontend                      | `ACCEPTED` |
| FR-005  | Rutas `/workshops/[id]` y `/workshops/[id]/sucursales`, espejo de `/dealerships/[id]`      | `ACCEPTED` |
| FR-006  | El checklist se deriva de datos existentes; no se agrega campo de completitud en BD       | `ACCEPTED` |
| FR-007  | Los errores de UI nunca muestran texto crudo del backend                                  | `ACCEPTED` |

### Seguridad (coordinadas con el agente Security — no resueltas por frontend)

| ID     | Decisión                                                                    | Estado    |
| ------ | --------------------------------------------------------------------------- | --------- |
| SEC-001 | No confiar en `X-Context-Type` / `X-Context-Id`; validar server-side         | `PENDING` |
| SEC-002 | Persistir el contexto activo en cookie httpOnly, no en localStorage          | `PENDING` |
| SEC-003 | Exposición mínima de permisos en `/auth/me`                                  | `PENDING` |

---

## 5. Detalle de decisiones

### PROD-001 — Auto-servicio "Mi taller" en el MVP

**Estado:** `ACCEPTED`

**Contexto.** El backend expone `PATCH /api/workshops/:id`, `POST /api/workshops/:id/branches` y `POST /api/workshops/:id/branches/:branchId/hours` con permisos `workshop.update`, `workshop.branch.create` y `workshop.hours.set`. El frontend no consumía ninguno. El único formulario de datos de taller para el dueño era el paso 2 del wizard de invitación (`/invitations/[token]`), de un solo uso: lo que el dueño no completara ahí quedaba congelado.

Impacto funcional del vacío: `/atenciones/nueva` deshabilita el submit cuando `branches.length === 0`, de modo que un taller recién onboardeado no podía registrar su primera atención.

**Decisión.** La pantalla "Mi taller" entra en el MVP. El dueño puede mantener sus datos y gestionar sucursales desde la aplicación.

**Consecuencia.** El bloqueo de functionalities del taller no requiere cambios de backend: es trabajo de frontend.

---

### PROD-002 — CUIT del taller: edición libre con auditoría

**Estado:** `ACCEPTED`

**Decisión.** El dueño puede cargar y subsequently editar el CUIT de su taller libremente, con **auditoría obligatoria** de quién lo cargó o modificó y cuándo.

- Sin validación contra AFIP/ARCA en el MVP (resuelto explícitamente: EP-3 = no).
- Validación sintáctica: formato y dígito verificador.
- No se exige que coincida con el CUIT del administrador que creó el taller (puede haber representante distinto).

**Rechazado.** Mantener la restricción actual de "solo admin de plataforma" — generaba tickets de soporte y contradecía la completitud progresiva.

**Dependencia de backend.** La auditoría requiere soporte en backend. No está resuelta.

---

### PROD-003 — Visibilidad de los datos del taller para miembros no owner

**Estado:** `ACCEPTED`

**Decisión.**

- **Visibilidad:** la pantalla es visible para todo miembro con acceso válido al contexto `WORKSHOP`, en modo lectura.
- **Edición:** habilitada por permiso, acción por acción.
- **Señalización:** ante falta de permiso, la acción se muestra deshabilitada con texto de ayuda breve, **no** oculta.

**Rechazado.** Ocultar la sección a `mechanic`/`employee` — un mecánico necesita ver datos de contacto, sucursales y horarios.

---

### PROD-004 — Checklist de completitud: informativo

**Estado:** `ACCEPTED`

**Decisión.** El checklist de completitud del perfil es **informativo**: banner de completitud en el dashboard del contexto taller + checklist detallado en "Mi taller".

**Excepción deliberada.** El requisito de al menos una sucursal **se mantiene bloqueante** únicamente en el flujo de registro de atención, que es donde ya existe ese comportamiento. No se propaga a otras operaciones.

**Contexto.** No se identificaron otras operaciones que requieran sucursal obligatoria. Si en el futuro alguna la requiere, debe evaluarse explícitamente antes de introducir un nuevo bloqueo.

**Riesgo.** La inconsistencia entre "la sucursal bloquea" y "el resto no bloquea" es intencional y documentada, no un bug.

---

### PROD-005 — Nombre del taller editable

**Estado:** `ACCEPTED`

**Decisión.** El dueño puede renombrar su taller, con validaciones mínimas (obligatorio, longitud razonable, caracteres válidos) y auditoría.

**Restricción.** Renombrar el taller **no debe alterar el historial** ya registrado (CareEpisodes, atenciones). El historial conserva la trazabilidad del contexto al momento del registro.

**Motivo.** El backend ya acepta `name` en `UpdateWorkshopDto` mientras la UI lo bloqueaba con la nota *"Tal como lo registró el administrador. No puede modificarse aquí"*. La asimetría se discovería en soporte.

---

### PROD-006 — Copy del wizard de invitación

**Estado:** `ACCEPTED` — **condicionado a PROD-001**

**Decisión.** Con "Mi taller" en el MVP, el copy del wizard puede invitar a completar los datos más adelante.

**Copy aprobado.** *"Estos datos quedan visibles para tus clientes. Podés actualizarlos más adelante desde tu taller."*

**Precondición.** Este copy **solo es válido si PROD-001 se implementa**. Si "Mi taller" seSacara del alcance, el copy debe corregirse para no prometer funcionalidad inexistente.

---

### PROD-010 — Vías de transferencia según contexto activo

**Estado:** `ACCEPTED`

**Decisión.** Las vías de transferencia disponibles dependen **exclusivamente del contexto activo de quien transfiere**, no del vehículo ni del rol de plataforma.

| Contexto activo | Vías disponibles | Dónde |
| --- | --- | --- |
| `PERSONAL` | `Email o alias` · `QR` · `Entregar a concesionaria` | Diálogo de transferencia |
| `DEALERSHIP` | *Ninguna vía de transferencia genérica* | — |
| `DEALERSHIP` | Vender · Devolver | `/dealerships/[id]` → Exhibición |
| `WORKSHOP` | Ninguna | CTA no se renderiza |

**Renombrado obligatorio.** La opción antes etiquetada "Concesionaria" describe al destinatario, no la acción. Se renombra a **"Entregar a concesionaria"** (flujo propietario → concesionaria / consignación).

**Resolución de la ambigüedad.** Existían dos flujos distintos bajo una etiqueta común:

| Flujo | Quién actúa | Dirección | Uso de la etiqueta "Concesionaria" |
| --- | --- | --- | --- |
| A | Propietario en `PERSONAL` | propietario → concesionaria | Incorrecto, se renombra |
| B | Concesionaria en `DEALERSHIP` | concesionaria → tercero | Correcto, corresponde al requerimiento original |

**Nota de verificación.** El flujo A es funcionalmente `propietario → concesionaria`, no `concesionaria → tercero`. El requerimiento original se satisface haciendo que B solo sea accesible desde contexto `DEALERSHIP`, no eliminandidA.

---

### PROD-011 — Email/alias no disponible en DEALERSHIP

**Estado:** `ACCEPTED`

**Decisión.** En contexto `DEALERSHIP` no se habilita la vía email/alias. La transferencia desde una concesionaria se resuelve con QR y las acciones propias (Vender / Devolver).

**Razón.** La transferencia por email está concebida entre personas en contexto personal. Habilitarla desde una concesionaria requiere caso de uso, rol autorizado, evento de dominio y reglas de trazabilidad que no están definidos.

**Revisión.** Habilitarla requiere un requerimiento explícito de producto, no una mejora técnica.

---

### PROD-012 — Vender / Devolver permanece en la pantalla de concesionaria

**Estado:** `ACCEPTED`

**Decisión.** Las acciones comerciales de concesionaria **no se unifican** en el diálogo genérico de transferencia. Permanecen en `/dealerships/[id]` → pestaña Exhibición.

**Razón.** Son acciones operativas del contexto de concesionaria con semántica propia (venta, devolución), no una "transferencia a tercero genérica".

---

### PROD-013 — Membresía no habilita la vía

**Estado:** `ACCEPTED`

**Decisión.** Un usuario con membresía de concesionaria que actúa en contexto `PERSONAL` **no ve** ninguna opción de concesionaria. En su lugar se muestra una **línea informativa no interactiva** que orienta a cambiar de contexto.

**Razón.** La señal que habilita las vías es el contexto activo, no la existencia de una membresía. Evitar un dead-end sin renderizar controles inertes.

**Copy aprobado.** *"Si querés transferir un vehículo de {concesionaria}, cambiá al contexto de la concesionaria desde el selector superior."*

---

### PROD-014 — Selector de contexto: transitorio aceptado

**Estado:** `ACCEPTED`

**Decisión.** El selector de contexto del header es un `<select>` nativo con estilos ad-hoc y sin indicación de contexto activo en el resto de la aplicación. Se acepta como **deuda UX tolerable en MVP**, condicionada a que PROD-013 proportionally una orientación clara al cambiar de contexto.

**Deuda registrada.** Indicador de contexto activo en el body + migrar los selectores al componente `Select` del design system.

---

### FR-001 — Solo opciones aplicables

**Estado:** `ACCEPTED`

**Decisión.** El diálogo de transferencia renderiza **únicamente** las vías aplicables al contexto activo. La opción no aplicable no se renderiza.

**Opciones descartadas.**

- (b) Mostrar la opción deshabilitada con explicación — genera controles inertes, más tab stops, y en un diálogo angosto el texto compite con el formulario.
- (c) Mostrarla activa y fallar en el submit — dead-end por diseño; el usuario descubre el límite después de haber hecho el trabajo.

**Fundamento.** El frontend no implementa reglas de autorización: expresa la señal de contexto que el backend ya evalúa como frontera. No hay cambio de contrato; solo deja de renderizar modos que el backend ya rechaza por contexto.

---

### FR-002 — Helper único de gating

**Estado:** `ACCEPTED`

**Decisión.** La decisión de qué vías mostrar vive en **una función pura y testeada**, compartida por `/vehicles/[id]`, `/transferencias` y cualquier entrada futura. Prohibido duplicar la lógica de gating por página.

---

### FR-003 — Reglas de renderizado del selector

**Estado:** `ACCEPTED`

**Decisión.**

- **0 vías disponibles:** no renderizar el diálogo ni el CTA que lo abre.
- **1 vía disponible:** no renderizar selector. Un modo único no es una elección.
- **2 o más vías:** renderizar como `Tabs` del design system, navegable con flechas y con `aria-selected` correcto.

**Motivo del cambio de componente.** El toggle actual es un `grid` de `<button aria-pressed>`: un radiogroup sin `role`, sin navegación por flechas. Semántica de accesibilidad incorrecta.

---

### FR-004 — Prohibido inferir autorización desde `role.code`

**Estado:** `ACCEPTED`

**Decisión.** El frontend **no** decide si mostrar acciones de edición comparando strings de rol (ej. `workshopMemberships[].role.code === "owner"`).

**Motivo.** Es autorización heurística que se desincroniza del backend en silencio. Contradice el principio de que el frontend nunca es frontera de seguridad.

**Opciones válidas.**

1. El backend expone el permiso efectivo por membresía (ver `BE-004` en el registro backend).
2. Se renderiza la acción y se acepta el 403, mostrándolo como estado "no autorizado".

**Pendiente.** Sin `BE-004`, la opción 2 es la única disponible.

---

### FR-005 — Rutas de auto-servicio de taller

**Estado:** `ACCEPTED`

**Decisión.**

```
/workshops/[id]                        → perfil + checklist + secciones
/workshops/[id]/sucursales             → gestión de sucursales
/workshops/[id]/sucursales/nueva       → alta
/workshops/[id]/sucursales/[branchId]  → edición + horarios
```

Espejo de `/dealerships/[id]`, que ya existe y establece el patrón.

**Alcance de esta iteración.** `Datos` + `Sucursales`. Las secciones `Equipo` y `Especialidades` **no se renderizan** hasta que el backend confirme el set de permisos y estos existan en el seed (ver `BE-001`).

---

### FR-006 — Checklist derivado

**Estado:** `ACCEPTED`

**Decisión.** El checklist de completitud se calcula a partir de datos ya disponibles en `GET /workshops/:id`. No se agrega ningún campo de completitud a la base de datos.

**Ítems.** Contacto · Web · Descripción · Razón social/CUIT · Sucursal sede · Contacto de sede.

**Accesibilidad.** El significado no puede depender del color: ítem pendiente = ícono + texto + borde. Nunca un contador "5/6" sin etiquetar cada ítem.

---

### FR-007 — Errores sin texto crudo

**Estado:** `ACCEPTED`

**Decisión.** Los mensajes de error de UI pasan por helpers centralizados por dominio (patrón ya presente: `transfer-errors.ts`, `admin-workshop-errors.ts`). Nunca se muestra el mensaje crudo del backend.

**Motivo.** El backend devuelve mensajes internos en español que no están escritos para el usuario final.

---

## 6. Correcciones al baseline del frontend

Detectadas al verificar el código durante el análisis que originó este registro. `FRONTEND_BASELINE.md` queda desactualizado en estos puntos y debe corregirse.

| ID        | El baseline afirma                                   | Realidad verificada                                                                  |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| BASE-001  | Active Context "NO IMPLEMENTADO"                     | **Implementado**: `src/lib/active-context.ts`, `useActiveContext()`, selectores, headers `X-Context-Type`/`X-Context-Id`. Único gap: no persiste tras refresh |
| BASE-002  | `usePermissions()` existe                            | **No existe**. Real: `src/lib/admin-access.ts` (`hasAdminAccess`, `can`, `hasRole`) + `useAuth()` |
| BASE-003  | `src/lib/validations.ts` existe                      | **No existe**. Schemas distribuidos por dominio                                      |
| BASE-004  | "No hay test runner, archivos, ni configuración"     | **Falso**. `vitest.config.ts`, scripts `test`/`test:watch`, **36 archivos de test** en carpetas `__test__/` (singular) |
| BASE-005  | `docs/frontend-auth-flow.md` en el frontend          | El frontend **no tiene `docs/`**. El documento vive en `api-follow-app/docs/specs/` |
| BASE-006  | Middleware deprecado, pendiente migrar a proxy       | ** apparently ya migrado**: existe `src/__test__/proxy.test.ts`. Verificar antes de reclasificar |

**Consecuencia.** La clasificación de deuda técnica del baseline no es confiable hasta aplicar estas correcciones. La clasificación de "sin tests" como `LOW` debe reconsiderarse: la suite existe y cubre journeys críticos, incluidos `transfer-dialog` y `active-context`.

**Nota.** El BLOCKER `getAuthHeaders` declarado en el baseline **no fue reverificado** en esta sesión. Sigue abierto.

---

## 7. Decisiones pendientes

Actualizado tras la revisión de arquitectura del Backend Tech Lead (2026-10-02). **BE-001 estaba mal cuantificado en este documento**: son 10 permisos, no 4.

| ID       | Asunto                                                                              | Responsable | Bloquea                              |
| -------- | ----------------------------------------------------------------------------------- | ----------- | ------------------------------------ |
| SEC-001  | Validación server-side de `X-Context-Type` / `X-Context-Id`                          | Security    | FR-001 parcialmente: el frontend puede leer el contexto, pero la frontera de seguridad es backend |
| SEC-002  | Persistencia del contexto activo entre refreshes                                     | Tech Lead   | Estabilidad de FR-001 tras refresh    |
| SEC-003  | Exposición de permisos efectivos en `/auth/me`                                       | Backend     | FR-004 opción 1; hoy solo queda la 2  |
| BE-001   | **10** permisos ausentes del seed (no 4): los 4 `workshop.*` más `admin.workshops.branches`, `admin.workshops.roles`, `admin.specialties.list/create/update/delete` | Backend | FR-005; y **7 endpoints del panel admin que hoy devuelven 403 en producción** |
| BE-002   | Endpoints de sucursal: listar con inactivas, editar, cambiar estado, leer horarios  | Backend     | Gestión completa de sucursales        |
| BE-003   | Índice único parcial de sede + normalización de duplicados preexistentes            | Backend / Database | Unicidad de sede               |
| BE-004   | Auditoría de cambios de perfil del taller                                            | Backend     | PROD-002, PROD-005                   |
| **BE-005** | **CUIT no normalizado entre escrituras → unicidad falsa de `tax_id`**           | Backend     | **Requisito previo de BE-004**       |
| **BE-006** | **Backend no valida el CUIT en absoluto** (solo `@IsString() @MaxLength(30)`)     | Backend     | Frontera de enforcement de PROD-002   |
| **BE-007** | **`CareEpisode.workshopName` nunca se setea** → renombrar un taller reescribe el historial vehicular | Backend | Contradice PROD-005 de forma literal  |

**Nota sobre BE-001.** 10 códigos están declarados en decoradores `@Permissions()` pero no existen en la tabla `permissions`; `PermissionsGuard` no puede resolverlos → **403 garantizado**. La mitad del problema es del panel de administración, que **sí está en uso**: `admin.workshops.branches`, `admin.workshops.roles` y `admin.specialties.*` afectan a los roles reales `admin` y `support` (`super_admin` pasa por bypass). Este registro los subestimó como "4 permisos sin UI que los invoque": es incorrecto para los 6 `admin.*`, que sí tienen UI. Además `admin.workshops.{branches,roles}` violan la convención vigente `admin.<recurso>.<verbo>` → PDP-4.

**Nota sobre BE-005.** `create-workshop.handler.ts` normaliza `taxId` con `replace(/\D/g,'')` (guarda `30123456789`), pero `PATCH /workshops/:id` pasa el DTO crudo y el frontend manda el valor **con guiones** (`30-12345678-9`, 14 chars). Como `workshops.tax_id` es `VarChar(30) @unique`, el mismo CUIT fiscal puede quedar registrado en dos talleres y el índice único no lo detecta. Es integridad de datos, y **auditar `tax_id` sin normalizar es auditar basura**: por eso BE-005 es requisito previo de BE-004, no un extra.

**Nota sobre BE-006.** El frontend valida forma + dígito verificador, pero el backend acepta cualquier string de 30 caracteres. La asimetría va en el sentido contrario de lo que suponía el baseline: **el eslabón débil es el backend**, y PROD-002 abre precisamente el camino que lo expone.

**Nota sobre BE-007 — el más grave para el producto.** `CareEpisode` ya tiene la columna snapshot `workshopName`, pero `create-care-episode.handler.ts` **no la setea**, y las queries resuelven con el fallback `episode.workshopName ?? episode.workshop?.name`. Consecuencia: **renombrar un taller reescribe retroactivamente su nombre en el historial de todos los episodios que registró**, contradiciendo PROD-005 de forma literal. El nombre histórico real de esos episodios **no está en ninguna parte**: no es recuperable, solo se puede reconstruir.

**Nota sobre auditoría.** PROD-002, PROD-005 y PROD-007 requieren soporte de auditoría en backend. Diseño cerrado (D-158 a D-165): tabla dedicada `workshop_profile_changes`, una fila por campo modificado, dentro de la **misma transacción** que el update del perfil. El evento `workshop.profile.updated` es espejo de `admin.dealership.updated` y hoy **no tiene consumidores** — el registro durable es la fila, no el evento. La ausencia de validación AFIP (EP-3) **no** es razón para postergar la auditoría: son cosas ortogonales.

---

## 8. Estado de implementación — "Mi taller" (PROD-001)

Iteración implementada sobre `web-follow-app`. Verificación: `tsc --noEmit` limpio, **450 tests en 38 archivos en verde**, `npm run build` OK con la ruta `/workshops/[id]` registrada.

### 8.1 Alcance entregado

| Decisión  | Estado      | Dónde                                                                    |
| --------- | ----------- | ------------------------------------------------------------------------ |
| PROD-001  | Implementada | `src/app/(dashboard)/workshops/[id]/page.tsx`, enlace en `layout.tsx`    |
| PROD-002  | **Parcial** | Campos editables implemented; la auditoría sigue pendiente (BE-004)     |
| PROD-003  | Parcial     | Modo lectura por 403; el gating fino requiere SEC-003                   |
| PROD-004  | Implementada | `src/lib/workshop-completeness.ts` + `workshop-completeness-card.tsx`   |
| PROD-005  | Parcial     | `name` editable (la UI antes lo tenía de solo lectura); auditoría pendiente |
| PROD-006  | Implementada | Copy público en formulario y checklist                                 |
| PROD-007  | **No**      | Ver 8.3                                                                 |

Archivos nuevos: `src/lib/workshop-completeness.ts`, `src/lib/cuit.ts`, `src/components/workshop/{workshop-profile-form,workshop-branches-section,workshop-completeness-card}.tsx`.
Tests nuevos: `src/lib/__test__/{cuit,workshop-completeness}.test.ts` (29 tests).

### 8.2 Desviaciones respecto de la decisión original

1. **`setBranchHours` no expuesto.** Existe `POST /:id/branches/:branchId/hours` pero **no existe su getter**. Escribir horarios sin poder leerlos implica sobrescribir a ciegas. Decidido no exponerlo hasta que BE-002 resuelva el getter.
2. **Sin edición ni baja de sucursal.** No existe `GET /:id/branches` (con inactivas), ni `PATCH /:id/branches/:branchId`, ni endpoint de estado. Como `GET /workshops/:id` solo devuelve sucursales **activas**, una sucursal desactivada quedaría inaccesible e inmanejable: implementar edición antes del getter produciría datos irrecuperables. Se limita la sección a **alta + lectura**.
3. **Secciones Equipo y Especialidades no renderizadas.** Sus permisos (`workshop.roles.*`, `workshop.specialties.manage`) están ausentes del seed (BE-001) → darían 403 garantizado. No se expone UI que solo pueda fallar.
4. **`FRONTEND_BASELINE.md` no existe** en ninguno de los dos repositorios, por lo que no hay archivo que corregir. Las correcciones de baseline viven en la sección 6 de este registro.

### 8.3 Lo que sigue pendiente

- **Gating contextual de transferencias** por `PROD-010`: en `PERSONAL` renderizar Email / QR / Entregar a concesionaria; en `DEALERSHIP` sacar las transferencias genéricas y dejar Vender/Devolver en `/dealerships/[id]`; en `WORKSHOP` no renderizar el CTA. **No implementado en esta iteración.**
- Auditoría de CUIT y de nombre (BE-004).
- Verificación del BLOCKER `getAuthHeaders`: `npm run build` **sí pasó** en esta iteración, lo que no descarta que el símbolo se use en una ruta no ejercitada por el build.

### 8.4 Advertencia sobre los tests de CUIT

Los fixtures de `cuit.test.ts` se derivaron aplicando el algoritmo a números de ejemplo; son **auto-consistentes con la implementación, no verificados contra una fuente externa**. Las dos ramas especiales (resto 10 → 9, resto 0 → 0) están cubiertas con casos deterministas y la aritmética está documentada en los comentarios. Aun así, conviene contrastar al menos un CUIT real contra una fuente oficial antes de considerar el validador cerrado.

### 8.5 Corrección a un supuesto propio (2026-10-02)

En la entrega de §8.2 se afirmó que la primera sucursal se marca sede "por defecto" y se presentó eso como mitigación suficiente mientras no exista el índice único parcial. **El Backend Tech Lead lo refutó leyendo el código, y tiene razón:**

- `workshop-branches-section.tsx:112` deja `isHeadquarters: !hasHeadquarters` como default, pero **el checkbox no está deshabilitado** cuando ya existe sede (líneas 353-363).
- Con `isHeadquarters` solo seteable en la creación (no hay PATCH de sucursal hasta BE-002), **la duplicación de sedes es alcanzable por la UI en dos clics**.

Corregir el supuesto: el default del frontend **no es una garantía**. El índice único parcial de BE-003 no es una red de seguridad futura, es **la única protección que existe del lado servidor**. Pendiente de corregir en el frontend deshabilitar el checkbox cuando ya hay sede — pero eso es mitigación de UX, **no enforcement**: el límite real llega con BE-003.

### 8.6 Decisiones de producto pendientes que acordamos con este lote

Escaladas por el Backend Tech Lead. Ninguna es una decisión técnica.

| ID      | Pregunta                                                                                             | Responsable | Impacto si no se decide |
| ------- | ---------------------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| PDP-1   | ¿El cambio de CUIT exige un motivo? (a) opcional siempre / (b) obligatorio cuando `field = 'taxId'` / (c) obligatorio para todo cambio de perfil | PM + Security | Define si la auditoría es decorativa o disuasiva. Cambia el contrato del formulario. **Es lo único que bloquea el arranque del lote de auditoría.** |
| PDP-2   | ¿Los cambios administrativos (`isActive`, `status`, `deletedAt`) se auditan con el mismo modelo?         | PM + Security | Hoy quedan fuera por ser de operador, no de auto-servicio |
| PDP-3   | Episodios ya registrados con `workshopName = NULL`: ¿backfill con el nombre actual, o dejar `NULL`? | PM + DB      | Contenido visible del timeline del vehículo. Un backfill es una escritura sobre historia vehicular |
| PDP-4   | ¿Los 2 permisos `admin.workshops.{branches,roles}` se registran tal cual o se renombran los decoradores? | Tech Lead + PM | Naming de permisos del panel admin |
| PDP-5   | ¿Se expone la auditoría al usuario del taller (`GET /workshops/:id/changes`)?                        | PM          | Mi posición: no en este lote. Obliga a decidir autorización de lectura, que no es un endpoint |

---

## 9. Decisiones resueltas por el PM (2026-10-02)

Las cinco escaladas de §8.6 quedaron cerradas. **BE-004 (auditoría) está desbloqueado.**

### 9.1 PDP-1 — Motivo del cambio de CUIT: **(a) Opcional siempre**

No hay ningún lector del motivo en el MVP (PDP-2 deja al operador fuera y PDP-5 no expone la auditoría al dueño). Obligarlo en `taxId` pondría fricción en el auto-servicio sin que nadie lo consuma. El valor disuasorio real está en *quién / cuándo / anterior / nuevo*, que ya es obligatorio e inmutable.

- **Regla:** el motivo es **por guardado, no por campo**. Si una acción tocó nombre y CUIT, el mismo motivo queda en las filas de ambos campos. Vacío → no se envía.
- **Se muestra solo cuando el CUIT difiere del valor guardado.** Si el dueño solo toca email o descripción, no ve nada nuevo.

| Elemento  | Texto                                                              |
| --------- | ------------------------------------------------------------------ |
| Label     | `Motivo del cambio`                                                |
| Helper    | `Opcional. Queda registrado en el historial de cambios de tu taller.` |
| Placeholder | `Ej.: corrección del CUIT cargado por error`                     |
| Validación | Solo longitud máxima (sugerencia 200). **Nunca requerido.**       |

**Cláusula de reevaluación:** cuando exista un flujo de revisión o consulta de la auditoría, el motivo pasa a **obligatorio para `taxId`** → (b). La transición la decide PM.

*Responsables:* Backend (`reason?: string` en `PATCH /workshops/:id`), Frontend (campo condicional + copy), Security (texto libre: longitud, sin HTML, sin secretos en logs).

### 9.2 PDP-2 — Cambios administrativos: **otra naturaleza, fuera de BE-004**

`isActive` / `status` / `deletedAt` quedan **fuera** de `workshop_profile_changes`. Esa tabla es el historial de auto-servicio del dueño; desactivar o borrar un taller es una decisión de estado de la plataforma.

**Riesgo aceptado y explícito:** en el MVP no queda registro persistente de qué operador desactivó o borró un taller. Consistente con `admin.dealership.status_changed`, que ya funciona así.

*Decisión diferida registrada:* toda acción de operador sobre un taller debe ser trazable a un operador identificado. **Post-MVP**, fuera de esta tabla. Responsables: Tech Lead (diseño) + Security (consulta).

### 9.3 PDP-3 — Episodios con `workshopName = NULL`: **(b) nunca backfill + precedencia snapshot primero**

Dos reglas inseparables:

1. **(b) Dejar `NULL`. Sin backfill, nunca.** Rechazo de (a) por **integridad del historial**, no por costo: un backfill escribiría historia que jamás existió y destruiría la única evidencia de que no fue capturada (`workshopName IS NULL`).
2. **Precedencia: snapshot primero.** `workshopName` si existe; la relación viva solo como fallback. Esta regla es la única forma de que PROD-005 sea cierta en la UI, no solo en el dato.

**Discrepancia detectada y ya corregida en frontend.** El PM verificó que `vehicle-history.ts:152` priorizaba el nombre vivo (`workshop?.name ?? workshopName`), mientras el backend y el detalle de episodio (`servicios/[servicioId]/page.tsx:268`) hacían al revés. Con esa precedencia el fix de snapshot **nunca se hubiera visto** y renombrar un taller reescribía el timeline retroactivamente. **Corregido**, con test que fija la regla (`PDP-3: el snapshot gana sobre el nombre vivo del taller`).

**Qué ven los episodios pre-fix:** el nombre **actual** del taller vía fallback, sin aviso. Conviven dos tipos de episodios que se distinguen **solo en datos, no en la interfaz**. Limitación conocida aceptada en el MVP.

- Rechazada (c) "taller (nombre anterior)": sería **falso** (se muestra el nombre actual) y saturaría el timeline.
- **Cláusula de reevaluación:** al **primer ejercicio real de renombre** sobre un taller con episodios pre-fix, PM reevalúa un aviso explícito. Al conservarse el `NULL`, esa salida sigue disponible.

*Responsables:* Frontend (precedencia, **hecho**), Backend (fix hacia adelante), Database (**sin migración de datos** — solo reportar cuántos episodios reales están en `workshopName IS NULL AND workshop_id IS NOT NULL`; el número no cambia la decisión), QA (renombrar no cambia el nombre en post-fix, sí puede en pre-fix).

### 9.4 PDP-4 — Naming de permisos: **corregir ahora, antes del primer seed**

Verificado que los 6 códigos no existen en `permissions`, no están asignados a ningún rol y ningún código del frontend los referencia → **renombrar hoy es gratis; después del seed es migración + contrato roto.**

| Hoy                                    | Pasa a                 | Motivo                                                                 |
| -------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `admin.workshops.branches`             | **`admin.workshops.manage`** | Ya existe y ya se seedea; significa exactamente lo que cubre        |
| `admin.workshops.roles`                | **`admin.workshops.read`**   | Ya existe y ya se seedea; es lectura de configuración              |
| `admin.specialties.list/create/update/delete` | **Tal cual**      | Ya cumplen `admin.<recurso>.<verbo>`                                   |

**BE-001 baja de 10 a 8 códigos a sembrar.** Se pierde la granularidad "solo sucursales" que ningún rol necesita hoy; si algún día hace falta delegarla, se agrega **aditivamente**. No se amplían permisos del rol `support` en este lote.

*Responsables:* Tech Lead (decoradores + seed), Security (matriz rol→permiso: `support` no debe recibir `.manage`), Backend (tests 403/200 por rol).

### 9.5 PDP-5 — Auditoría expuesta al usuario: **no, ni en este lote ni en el MVP**

Hoy el único editor por defecto es `owner`, así que el lector sería el mismo autor. Ante un reclamo ("alguien me modificó el CUIT") la respuesta es interna: soporte consulta la tabla. **Riesgo aceptado**, acotado por esa razón.

*Cláusula de reevaluación:* retomar cuando (i) exista un reclamo real de cambios de perfil, o (ii) `workshop.update` se delegue a un rol no-owner. En ese orden: **Security define el alcance de lectura primero**, luego endpoint y permiso. *Responsable:* Security.