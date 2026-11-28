# Handoff UX/UI — Lenguaje visual común del buscador por patente

**Prototipo interactivo:** `docs/prototypes/plate-search-visual-language.html`
**Elaborado:** `ux-ui-hcdv` con análisis técnico de `frontend-tech-lead`.
**Alcance elegido:** unificar **visualmente** los tres flujos, **sin unificar lógica, endpoints ni copy obligada**.

---

## 1. Diagnóstico

La misma palabra —«buscar por patente»— designa tres intervenciones distintas:

| Flujo | Pantalla | Modelo mental | Disparador | Formato |
|---|---|---|---|---|
| Lookup exacto | `atenciones/nueva/page.tsx:1389-1488` | «¿Existe este vehículo?» | Submit explícito (`Buscar`) | AAA111 / AA111AA |
| Filtro de lista | `vehicles/page.tsx:105-141`, `atenciones/page.tsx:162-213` | «Filtrá esta lista» | Debounce 300 ms | ≥ 2 chars, parcial (`SMK`) |
| Verificación | `claim-step-plate.tsx:81-103` | «Confirmá un dato tuyo» | Submit (`Continuar`) | AAA111 / AA111AA |

Hoy conviven tres alturas de campo (h-8, h-11/h-12), tres tratamientos de la pista de formato (texto plano, chip, texto libre), tres formas de mostrar «buscando» (spinner dentro del botón, spinner junto al hint, skeleton de resultados) y tres formas de mostrar el error (texto rojo, `Callout`, `EmptyState`). Eso es lo que se unifica.

**Ya hay reutilización correcta en capas bajas y no se toca:** `src/lib/license-plate.ts` y `Input sanitize="plate"` son usados por los 3 consumidores que exigen formato completo (`license-plate.ts:16-18` excluye explícitamente los listados).

## 2. Principio rector

> **Un mismo field y unos mismos estados; comportamiento y contrato siguen siendo de cada pantalla.**

No se crea un `VehiclePlateSearch` con `mode / allowCreate / requireWorkshop / debounceMs / emptyCopy / onNavigate`. Ese componente sería acoplamiento disfrazado de abstracción: el lookup es WORKSHOP-only y con throttle 30/60 (`care-episodes.controller.ts`), devuelve un DTO sin PII, y su 404 significa «registrar vehículo nuevo» (D-158). Los listados son paginados, usan `vehicles?q=` / `care-episodes?q=`, y su 404 es un `EmptyState`. Unificarlos daría 403 en PERSONAL y mezclaría semánticas incompatibles.

## 3. Anatomía del campo compartido

Orden fijo, mismo en los tres flujos:

1. **Label asociado** (`htmlFor`). Visible en check-in y reclamo; `sr-only` en listados.
2. **Icono de lupa** a la izquierda, decorativo (`aria-hidden`).
3. **Input de 44 px** de alto (h-11), foco con `ring-3`, `maxLength` propio de cada flujo, `sanitize="plate"` solo donde se exige formato completo.
4. **Slot derecho contextual:** botón X (36 px visibles / ~44 px de área clickeable) en filtros · spinner en búsqueda · vacío en reclamo.
5. **Pista de formato como chip** (`bg-secondary/70`, icono `Info`, `text-xs`). El **texto** se conserva literal en cada flujo; se unifica el contenedor, no el copy.
6. **Error inline** (`text-destructive` + `aria-invalid` + `aria-describedby`), con `role="alert"`. Nunca reemplaza a la pista, se agrega debajo.

**Accesibilidad ya vigente que se preserva:** Escape limpia en `/atenciones`, anunciador `sr-only` con `role="status"` para el resultado del filtro, `type="search"` en listados.

## 4. Los seis estados

| Estado | Presentación común | Nota por flujo |
|---|---|---|
| Reposo | Field + chip de pista | En listados, sin resultado aún |
| Buscando | Spinner en slot derecho + `role="status"` «Buscando…» | Listados Además mantienen skeleton en la lista de resultados |
| Encontrado | Tarjeta: patente en `font-semibold`, metadata en `text-muted-foreground`, CTA `primary` | Check-in: «Continuar con el check-in» · Listados: una tarjeta por fila, CTA → detalle · Reclamo: no aplica, sigue al challenge |
| Sin resultados | `EmptyState`: círculo con icono + título + descripción + botón `outline` | Check-in usa `Callout info` compacto (porque ofrece crear) · Listados `EmptyState` · Reclamo `Callout destructive` |
| Error de consulta | `Callout destructive` + botón `outline` «Reintentar» | Check-in ya tiene la copy centralizada en `check-in-errors.ts`; no se toca |
| Formato inválido | Borde rojo + error inline bajo el field | Solo check-in y reclamo; los listados admiten texto parcial |

## 5. Implementación propuesta (reutilizando lo que ya existe)

Componentes **presentacionales**, sin fetch, sin router, sin permisos:

- `src/components/vehicle/plate-search-field.tsx` — field de la §3. Props: `id`, `label` (puede ser `sr-only`), `placeholder`, `value`, `onChange`, `hint`, `error`, `loading`, `clearable`, `onClear`, `className`. Un único `size` implícito (44 px); sin flags de negocio.
- `src/components/vehicle/plate-result-card.tsx` — estado «encontrado». Props: `plate`, `meta?`, `actionLabel`, `onAction`.
- Los estados «sin resultados / error» **ya tienen primitivas**: `src/components/ui/empty-state.tsx` y `src/components/ui/callout.tsx`. No crear nuevas.

La lógica **no se mueve**: `usePlateLookup` sigue siendo un hook pendiente condicionado a un segundo consumidor de lookup exacto (ver §7). `/vehicles` y `/atenciones` conservan su `useQuery` + `effectiveQ` + debounce; el reclamo conserva `claimPlateSchema` y su copy literal.

Aplicación por etapas:

1. **Etapa 1 — check-in:** reemplazar el bloque `page.tsx:1393-1430` por `PlateSearchField`; el estado found por `PlateResultCard`; el error por `Callout`. Sin cambios de copy ni de estados.
2. **Etapa 2 — listados:** reemplazar los dos bloques de búsqueda por el mismo field (`label` sr-only, `clearable`, hint como chip). `/atenciones` ya trae el chip; `/vehicles` pasa de texto plano a chip. Sin tocar `effectiveQ`, queries ni paginación.
3. **Etapa 3 — reclamo:** usar el mismo field respetando `claimPlateSchema` y la copy §1.3 al pie de la letra. No agregar chip de formato donde la spec no lo prevé: el helper existente se mantiene con el mismo texto y estilo muted.

## 6. Contratos que NO se cambian

- `license-plate.ts` y su copy `LICENSE_PLATE_FORMAT_ERROR`.
- `check-in-errors.ts` (copy de lookup: un único mensaje para red/5xx/429; nunca ofrecer crear ante error).
- `vehicle-claim-copy.md` / spec §1.3: títulos, helper, placeholder y CTA del reclamo son literales (FR-007).
- Endpoints `care-episodes/lookup`, `vehicles?q=`, `care-episodes?q=`; headers de contexto inyectados por `api.ts`.
- `CareEpisodeLookupVehicle` (sin PII) y `VehicleListResponse` (con ownerships/fotos).
- Decisión 404 → crear del check-in (D-158/D-159).
- Backend valida 2–10 alfanuméricos: el formato AAA111/AA111AA sigue siendo **feedback de frontend**, no regla oficial (`license-plate.ts:20-21`).

## 7. Escalados / pendientes

- **Hook `usePlateLookup` (extracción de lógica):** requiere un segundo consumidor real de *lookup exacto*. Sin él sería abstracción prematura. Seguir en etapa 1 de propuesta previa.
- **Auto-búsqueda sobre lookup:** revisar throttle 30/60 y riesgo de enumeración con Backend/Security antes de aplicar debounce al check-in.
- **Consistencia de copy entre listados:** unificar «Patente vieja AAA111 · patente nueva AA111AA» es seguro; cambiar la copy del check-in o del reclamo requiere acuerdo de producto/spec.

## 8. Criterios de aceptación

- [ ] Los tres flujos usan un field de 44 px con lupa a la izquierda y chip de pista con el mismo estilo.
- [ ] Cada flujo conserva su copy literal y su disparador (submit vs debounce).
- [ ] Los seis estados se reconocen visualmente igual en los tres contextos donde aplican.
- [ ] `aria-invalid`, `aria-describedby`, `role="alert"`/`role="status"` y el anunciador `sr-only` siguen presentes.
- [ ] Tests existentes **sin cambios**: `new-care-episode-page.test.tsx`, `vehicles-page.test.tsx`, `atenciones-page.test.tsx`, `license-plate.test.ts`.
- [ ] `tsc --noEmit`, ESLint, suite completa (878 tests) y `next build` en verde.
