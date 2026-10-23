<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — Frontend HCDV

> **Contexto de producto y coordinación entre repos.**
> Las convenciones técnicas de Next.js/React las define el **Frontend Tech Lead**
> y van completas acá abajo. Lo que está antes de esa sección es **contexto de
> producto** y no debe contradecirse.

## 1. Producto

**Historia Clínica Digital Vehicular (HCDV)** — también llamada **Autentia** en el
código y la comunicación comercial.

El producto construye una historia digital, confiable y trazable de un vehículo.

**Principio central: el vehículo es el centro.** Las funcionalidades se evalúan
por cómo contribuyen a identificar un vehículo, construir su historial, mantener
su integridad, consultarlo y facilitar la interacción entre propietarios y
talleres.

Un taller puede registrar atenciones, pero **un taller no es propietario** de un
vehículo por el hecho de registrar una atención. No asumir `User = propietario`.

## 2. Repos y contrato entre repos

Este repo es **solo el frontend**. El backend vive aparte:

| | Ubicación |
|---|---|
| Frontend (este repo) | `C:\Users\dario_xn6f7lj\Desktop\PROYECTOS\web-follow-app` |
| Backend | `C:\Users\dario_xn6f7lj\Desktop\PROYECTOS\api-follow-app` |

**El registro de decisiones del producto es el del backend:**
`api-follow-app/DECISION-REGISTER.md`. Las decisiones de producto **no se toman
acá**. Si el frontend y el backend discrepan, la fuente de verdad es el backend.

### Flujo de trabajo entre repos

- Un cambio de contrato API se define en el backend primero.
- Nunca inventar endpoints, campos ni reglas de negocio en el frontend.
- Si el frontend detecta que un contrato no alcanza, **se escala al PM/Tech Lead**, no se resuelve localmente.

## 3. Despliegue (verificar antes de tocar auth)

| | |
|---|---|
| Frontend | `https://autentia-ui.vercel.app/` (Vercel) |
| Backend | `https://api-follow-app.onrender.com/` (Render) |

Son **dominios distintos**. El frontend usa un rewrite same-site:

```json
// vercel.json
{ "rewrites": [{ "source": "/api/:path*", "destination": "https://api-follow-app.onrender.com/api/:path*" }] }
```

> ⚠️ **DECISIÓN DE ARQUITECTURA PENDIENTE:** confirmar en Vercel que
> `NEXT_PUBLIC_API_URL=/api` (**relativa**). Si fuera una URL absoluta a
> `onrender.com`, las cookies `SameSite=Strict` del backend no viajarían y la
> sesión se caería en producción. `.env.example` hoy solo documenta `localhost`
> y no aclara el valor de producción.

### Sesión

- **100% por cookies httpOnly.** No se escribe token en `localStorage` ni
  `sessionStorage` (decisión **D-001**, verificada por test).
- El guard de rutas (`src/proxy.ts`) depende de la cookie `access_token`.
- Cliente HTTP: `credentials: "include"`.

Cualquier flujo nuevo de login (incluido OAuth social) **debe** devolver la
sesión por cookie en el dominio del frontend, nunca por body con token.

## 4. Conceptos de dominio que la UI debe respetar

| Concepto | Convención |
|---|---|
| `CareEpisode` | UI: **"Atención"** o **"Ingreso de Servicio"**. No inventar nombres equivalentes. |
| `Vehicle` | Entidad central. |
| `Ownership` | **Histórico.** No se edita ni se borra; se encadena. Un vehículo 0km vendido por una concesionaria tiene Ownership `company` (D-101). |
| `Workshop` | Taller. **No** es propietario por registrar atenciones. |
| `Dealership` | Concesionaria. Actor **distinto** del taller (D-102). |
| Active Context | `PERSONAL` / `WORKSHOP` / `DEALERSHIP`. Se inyecta por headers (`X-Context-Id`), no por path. |

## 5. Reglas de producto para frontend

- **Nunca resolver autorización solo en la UI.** El backend es la frontera final
  de enforcement. Ocultar un botón no es un permiso.
- **Nunca inventar reglas de negocio** para resolver un hueco de información.
  → `DECISIÓN DE PRODUCTO PENDIENTE`.
- Microcopy en **voseo rioplatense** ("Escaneá", "Confirmá", "Podés", "Recuperás").
- Estados vacíos y de error: siempre vía los helpers centralizados, **nunca
  texto crudo** (patrón: `@/lib/transfer-errors`).
- Distinguir visualmente **"0 km"** de **"kilometraje no registrado"**. Un 0km real
  tiene registro de odómetro; la diferencia es parte de la confianza del producto.
- No hardcodear valores que deberían venir del catálogo o del backend.

## 6. Convenciones técnicas

> ⚠️ **PENDIENTE — completo el Frontend Tech Lead.**
> Esta sección está sin llenar. Debe cubrir, como mínimo:
>
> - Estructura de carpetas y App Router conventions.
> - HTTP client (`src/lib/api.ts`) y estrategia de manejo de errores/retry.
> - TanStack Query: convenciones de queries, mutations e invalidación.
> - react-hook-form + zod: esquemas y manejo de errores de validación.
> - Componentes: shadcn/ui + `@base-ui/react`, `components.json`.
> - Testing: Vitest, qué se testea y qué no.
> - Variables de entorno del frontend y su validación.

## 7. Estado actual

- Stack: Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui +
  `@base-ui/react`, TanStack Query, react-hook-form + zod, `ky`, Vitest.
- Ya instalado y **usado**: `html5-qrcode` (escáner), `qrcode.react` (generador).
- Rutas de interés: `/transfer/qr/[token]` (público), `/escaneo`,
  `/transferencias`, `/login`, `/register`.

## 8. Definición de Done (frontend)

- Criterios de aceptación del PM cumplidos.
- Journey completo, no la pantalla aislada.
- Estados de loading / vacío / error / permisos cubiertos.
- No se rompió ningún contrato existente del backend.
- Tests relevantes agregados.
- Sin secretos en el código ni en variables commiteadas.
