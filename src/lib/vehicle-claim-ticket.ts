/**
 * F-1 — store en memoria del ticket de reclamo (`/reclamo/[token]`).
 *
 * El backend emite un ticket firmado de 20 minutos (`expiresIn: 1200`) en el
 * `verify` y lo exige en el `commit` (spec §1.8: "el frontend lo guarda en
 * memoria (no en localStorage)"). El store es un Map de módulo: sobrevive a
 * los cambios de paso del wizard SIN persistir nada en el navegador.
 *
 * LÍMITES (documentados a propósito):
 * - Un reload del navegador pierde el ticket → el wizard vuelve a verificar
 *   (el bootstrap `verified` sin ticket muestra el paso de patente otra vez).
 * - La navegación entre el wizard y login/register debe ser client-side
 *   (next/link o router.push) para no perder el módulo; el fallback ante un
 *   hard reload es re-verificar, nunca un error.
 *
 * El ticket además se usa SOLO para display: el `vehicleId` del CTA de éxito
 * (§1.9) se decodifica del payload del propio ticket (el commit NO devuelve
 * vehicleId). Es información que el usuario acaba de verificar — no se
 * excribe en storage ni viaja a ningún lado.
 */

export interface ClaimTicketRecord {
  ticket: string;
  /** Patente verificada en este flujo (§1.9 la muestra en el copy de éxito). */
  licensePlate: string;
}

const ticketStore = new Map<string, ClaimTicketRecord>();

/** Guarda el ticket de un token; un ticket nuevo reemplaza al anterior. */
export function saveClaimTicket(
  token: string,
  record: ClaimTicketRecord,
): void {
  ticketStore.set(token, record);
}

/** Ticket vigente para el token, o `undefined` si se perdió/expiró en UI. */
export function getClaimTicket(token: string): ClaimTicketRecord | undefined {
  return ticketStore.get(token);
}

/** Borra el ticket (logout implícito del flujo o reinicio). */
export function clearClaimTicket(token: string): void {
  ticketStore.delete(token);
}

/**
 * Decodifica el payload del ticket JWT (base64url) y devuelve el `vehicleId`.
 *
 * Payload del backend (claim-token.service): `{ inviteId, vehicleId,
 * purpose: 'claim' }`. Sólo lectura local para armar el CTA `Ver el
 * historial` del §1.9; si el decode falla, la UI oculta el CTA (nunca
 * inventa un destino).
 */
export function decodeClaimTicketVehicleId(ticket: string): string | null {
  try {
    const part = ticket.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    const payload = JSON.parse(json) as { vehicleId?: unknown };
    return typeof payload.vehicleId === "string" && payload.vehicleId
      ? payload.vehicleId
      : null;
  } catch {
    return null;
  }
}
