# Handoff UX/UI — Formulario «Datos del taller»

**Componente:** `src/components/workshop/workshop-profile-form.tsx`
**Prototipo interactivo:** `docs/prototypes/workshop-profile-form-redesign.html`
**Elaborado:** UX/UI (`ux-ui-hcdv`) en conjunto con Frontend Tech Lead (`frontend-tech-lead`).
**Estado:** etapas 0-2 **implementadas** (ver §6). Etapas 3-4 y los escalados de §5 quedan pendientes de decisión.

---

## 1. Problema de UX

El formulario actual resuelve la función pero no comunica nada:

- 7 campos en una grilla plana, sin jerarquía ni agrupación: «Nombre», «CUIT» y «Descripción» pesan lo mismo.
- No distingue obligatorio de opcional: el asterisco aparece solo en Nombre y el resto parece obligatorio por defecto.
- El CUIT se formatea solo al completar 11 dígitos, sin explicar el formato ni qué validación se hace.
- La descripción tiene límite de 200 caracteres en el esquema, pero el usuario solo lo descubre al enviar.
- «Guardar cambios» está siempre habilitado: no hay feedback de si hay cambios pendientes, y no hay forma de descartarlos.
- El texto «Estos datos son públicos…» vive al final, desconectado de los campos a los que aplica.

## 2. Principios aplicados

1. **Agrupar antes que decorar:** tres grupos con sentido para el dueño — *Identidad*, *Contacto*, *Presencia online*.
2. **No hacer adivinar:** obligatorio = asterisco rojo; opcional = etiqueta gris «Opcional».
3. **Ayuda en el momento justo:** formato del CUIT y contador de caracteres como texto de apoyo, no como error.
4. **Feedback sin interrumpir:** errores inline al blur, banners inline (`Callout`) ya existentes, sin toasts.
5. **Estado siempre visible:** «Sin cambios / Cambios sin guardar» y botón de descarte.
6. **Mobile primero:** una columna, targets táctiles cómodos, sin scroll horizontal.
7. **Cero inventario de producto:** no se agrega ningún flag de visibilidad, campo ni regla de negocio nueva.

## 3. Decisiones de diseño (detalle)

| # | Decisión | Copy / comportamiento | Por qué |
|---|----------|----------------------|---------|
| D1 | Agrupar en secciones con `SectionHeader` | *Identidad* → Nombre, Razón social, CUIT · *Contacto* → Email, Teléfono · *Presencia online* → Sitio web, Descripción | Reduce carga cognitiva; reutiliza primitiva existente (`src/components/ui/section-header.tsx`) |
| D2 | Etiquetas de opcional | Chip gris «Opcional» en los 6 campos no obligatorios | El único obligatorio es `name` (zod `min(2)`) |
| D3 | CUIT con ayuda honesta | *«11 dígitos, con o sin guiones. Validamos el formato, no la situación fiscal.»* | PROD-002: validación sintáctica, sin AFIP/ARCA en el MVP. No presentarlo como validación oficial (BE-006 abierto) |
| D4 | Descripción con contador | `0 / 200`, ámbar desde 180 | El `max(200)` ya existe; solo se hace visible |
| D5 | Validación al blur | `mode: "onBlur"` en react-hook-form | Evita el error mientras se tipea; mensajes existentes sin cambios |
| D6 | Estado de guardado | Pill «Sin cambios / Cambios sin guardar»; Guardar y Descartar deshabilitados si `!isDirty` | Patrón ya usado en `edit-admin-dealership-form.tsx` |
| D7 | Descarte con confirmación | «Descartar cambios» → `Dialog` de confirmación cuando `isDirty` | Evita pérdida accidental; sin bloquear navegación interna (ver §5) |
| D8 | Nota de privacidad | Se conserva **literalmente**: «Estos datos son públicos: los ven tus clientes.» bajo Descripción | Copy aprobado (PROD-006). No se extiende a Razón social / CUIT sin decisión de PM |

**Accesibilidad:** errores con `role="alert"`, inputs con `aria-invalid` y `aria-describedby` hacia hint + error; etiquetas asociadas por `htmlFor`. Criterios AA ya verificados para `Callout` (`src/components/ui/callout.tsx:15`).

## 4. Reutilización de formularios — acuerdo con Frontend Tech Lead

El analysis técnico (`frontend-tech-lead`) confirmó duplicación real y propuso una abstracción **mínima**, no un «formulario genérico de entidad»:

- **Compartir lógica pura, no pantallas.** Los contratos difieren: `name` max 150 en perfil taller vs 120 en dealership/admin; `website` texto libre vs `.url()` en admin/wizard; `description` max 200 vs 500. Unificarlos a ciegas rompería valores hoy válidos.
- **Nuevo `src/lib/entity-form-schema.ts`:** extraer `optionalText` (hoy duplicado en el perfil y en `workshop-branches-section.tsx`) + `optionalEmail` + `optionalCuit`, parametrizados, sin valores por defecto que endurezcan validaciones.
- **Nuevo `src/components/forms/form-field.tsx`:** un wrapper `Label → control → error/hint` que reemplaza 7 repeticiones y agrega `aria-describedby`. No es un form builder.
- **Nuevo `src/lib/workshop-profile.ts`:** `toFormValues(workshop)` y `toUpdateWorkshopPayload(values)`, moviendo el mapeo inline de `onSubmit`/`reset` a código puro y testeable.
- **`SectionHeader` existente** para los títulos de sección. **No usar** `FormSectionAccordion`: es el lenguaje del check-in (una sola sección abierta), pesado para 7 campos.

Ganancia: el mismo esquema y el mismo `FormField` sirven para el perfil del taller, sucursales y futuros formularios de entidad, sin acoplar DTOs distintos.

## 5. Fuera de alcance / escalado (decisiones que no son de UX ni de frontend)

| Ítem | Estado | Destinatario |
|------|--------|--------------|
| Rotular Razón social / CUIT como «público» | No hacer: los endpoints públicos exponen `id/name/logoUrl/city`; no hay contrato para esos campos | PM + Backend |
| Máscara de teléfono (formato AR local vs internacional) | Requiere definición | PM / UX |
| Campo «Motivo del cambio» y auditoría (BE-004, PDP-1) | Decidido «opcional siempre», pero el backend aún no lo consume; agregarlo sería UX engañosa | Backend + Security + PM |
| Validación de CUIT en servidor (BE-006) | Frontend valida, backend no: documentar, no prometer validación oficial | Backend |
| Bloquear navegación interna / back del browser | Verificar API de Next 16 antes de prometerlo (`AGENTS.md` obliga a leer `node_modules/next/dist/docs/`) | Frontend Tech Lead |
| Normalizar `taxId` a dígitos en el PATCH | No hacer: ocultaría el bug de unicidad BE-005 | Backend |

## 6. Plan de implementación acordado (por etapas)

Cada etapa cierra con `npx tsc --noEmit` + `npm test` + `npm run build`. No mezclar refactor con cambio de comportamiento.

- **Etapa 0 — refactor puro — ✅ HECHA:** `src/lib/entity-form-schema.ts`, `src/lib/workshop-profile.ts`, `src/components/forms/form-field.tsx`; componente migrado conservando mensajes y límites. Tests unitarios de los helpers.
- **Etapa 1 — UX visual — ✅ HECHA:** secciones con `SectionHeader`, chip «Opcional», contador con `useWatch`, mobile (grilla `md:grid-cols-2`). Tests de componente.
- **Etapa 2 — comportamiento — ✅ HECHA:** `mode: "onBlur"`, `disabled={isSubmitting || !isDirty || !isValid}`, pill de estado. Tests de blur y de botón.
- **Etapa 3 — máscaras — pendiente:** `formatCuitProgressive` (util pura + tests). Teléfono, solo tras decisión de PM.
- **Etapa 4 — descarte — pendiente:** «Cancelar/Descartar» + `Dialog`; `beforeunload`. Navegación interna, solo tras verificación técnica.

**Verificación de las etapas 0-2:** `tsc --noEmit` ✅ · ESLint sin warnings ✅ · suite completa 878/878 tests ✅ · `next build` ✅. El payload de `PATCH /workshops/:id` quedó intacto (7 campos, `taxId` con guiones, vacíos → `null`).

## 7. Criterios de aceptación para dar por done

- [ ] Las 3 secciones se ven en desktop y en mobile (1 columna).
- [ ] Solo Nombre marca obligatorio; el resto muestra «Opcional».
- [ ] El CUIT muestra su ayuda y el error aparece al blur, nunca al escribir.
- [ ] El contador de descripción actualiza y avisa desde 180/200.
- [ ] Guardar está deshabilitado al abrir y tras guardar; se habilita al editar.
- [ ] «Descartar cambios» pide confirmación y restaura valores.
- [ ] Errores y hints enlazados por `aria-describedby`; `aria-invalid` correcto.
- [ ] Tests nuevos pasan; contrato `PATCH /workshops/:id` intacto.
