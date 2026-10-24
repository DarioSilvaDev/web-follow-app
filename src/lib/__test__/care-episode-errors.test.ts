/**
 * Tests de care-episode-errors — mapeo de errores S1/S4/S5.
 *
 * Regresión del bug de upload de evidencia (POST /:id/attachments → 500
 * INTERNAL_ERROR por uuid=text en el FOR UPDATE): el UI confundía un 500
 * real con un fallo de red porque ambos caían en el mismo fallback genérico.
 * Estos tests fijan la distinción:
 * - 5xx (status presente) → copy de "error del servidor".
 * - Sin status (red/timeout — ky aborta con DOMException, `toApiError` lo
 *   relanza tal cual) → copy de "no se pudo conectar".
 */
import { describe, expect, it } from "vitest";
import {
  GENERIC_CARE_EPISODE_ERROR_MESSAGE,
  NETWORK_ERROR_CARE_EPISODE_ERROR_MESSAGE,
  SERVER_ERROR_CARE_EPISODE_ERROR_MESSAGE,
  resolveAttachmentUploadErrorMessage,
  resolveCareEpisodeDetailErrorMessage,
} from "@/lib/care-episode-errors";

function httpError(status: number, message?: string) {
  return { status, message };
}

describe("resolveAttachmentUploadErrorMessage — fallback 5xx vs red", () => {
  it("500 con status → mensaje de error del servidor (no el genérico)", () => {
    expect(
      resolveAttachmentUploadErrorMessage(httpError(500, "Internal server error")),
    ).toBe(SERVER_ERROR_CARE_EPISODE_ERROR_MESSAGE);
    expect(
      resolveAttachmentUploadErrorMessage(httpError(500, "Internal server error")),
    ).not.toBe(GENERIC_CARE_EPISODE_ERROR_MESSAGE);
  });

  it("otros 5xx (502/503/504) → también mensaje de error del servidor", () => {
    expect(resolveAttachmentUploadErrorMessage(httpError(502))).toBe(
      SERVER_ERROR_CARE_EPISODE_ERROR_MESSAGE,
    );
    expect(resolveAttachmentUploadErrorMessage(httpError(503))).toBe(
      SERVER_ERROR_CARE_EPISODE_ERROR_MESSAGE,
    );
    expect(resolveAttachmentUploadErrorMessage(httpError(504))).toBe(
      SERVER_ERROR_CARE_EPISODE_ERROR_MESSAGE,
    );
  });

  it("error sin status (timeout/abort de red) → mensaje de conexión", () => {
    expect(
      resolveAttachmentUploadErrorMessage(new Error("The user aborted a request.")),
    ).toBe(NETWORK_ERROR_CARE_EPISODE_ERROR_MESSAGE);
  });

  it("4xx ya mapeados no cambian (413 tamaño, 409 cerrado, 403 permiso)", () => {
    expect(resolveAttachmentUploadErrorMessage(httpError(413))).toBe(
      "La imagen supera el tamaño máximo de 5MB.",
    );
    expect(
      resolveAttachmentUploadErrorMessage(
        httpError(409, "Episodio cerrado/verificado; no se pueden agregar evidencias"),
      ),
    ).toBe("El servicio está cerrado o verificado; no se pueden agregar evidencias.");
    expect(resolveAttachmentUploadErrorMessage(httpError(403))).toBe(
      "No tenés permiso para adjuntar evidencia a este servicio.",
    );
  });

  it("4xx desconocido (p. ej. 402) → genérico, ni servidor ni conexión", () => {
    expect(resolveAttachmentUploadErrorMessage(httpError(402))).toBe(
      GENERIC_CARE_EPISODE_ERROR_MESSAGE,
    );
  });
});

describe("resolveCareEpisodeDetailErrorMessage — fallback 5xx vs red", () => {
  it("500 → mensaje de error del servidor", () => {
    expect(resolveCareEpisodeDetailErrorMessage(httpError(500))).toBe(
      SERVER_ERROR_CARE_EPISODE_ERROR_MESSAGE,
    );
  });

  it("sin status → mensaje de conexión", () => {
    expect(resolveCareEpisodeDetailErrorMessage(new TypeError("Failed to fetch"))).toBe(
      NETWORK_ERROR_CARE_EPISODE_ERROR_MESSAGE,
    );
  });

  it("404 mapeado no cambia", () => {
    expect(resolveCareEpisodeDetailErrorMessage(httpError(404))).toBe(
      "Servicio no encontrado o ya no está disponible.",
    );
  });
});
