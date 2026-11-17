/**
 * F-1/F-2 — clasificación de errores del módulo de reclamo (contrato
 * backend: status + code + mensaje para las variantes 409/410).
 */
import { describe, it, expect } from "vitest";
import {
  claimPublicErrorKind,
  CLAIM_TERMINAL_COPY,
  CLAIM_VERIFY_ERROR,
  CLAIM_FORMAT_ERROR,
  CLAIM_NETWORK_ERROR,
  isClaimAlreadyTaken,
  resolveClaimPanelMessage,
  resolveClaimVerifyErrorMessage,
} from "@/lib/vehicle-claim-errors";

function apiError(
  status?: number,
  code?: string,
  message?: string,
  errors?: Record<string, unknown>,
): Record<string, unknown> {
  return { status, code, message, errors };
}

describe("claimPublicErrorKind", () => {
  it("clasifica errores sin status como red", () => {
    expect(claimPublicErrorKind(new Error("boom"))).toBe("network");
    expect(claimPublicErrorKind({})).toBe("network");
  });

  it("400 VALIDATION_ERROR → formato; otro 400 → verificación fallida", () => {
    expect(claimPublicErrorKind(apiError(400, "VALIDATION_ERROR"))).toBe(
      "format",
    );
    expect(
      claimPublicErrorKind(
        apiError(400, "CONFLICT", "No pudimos verificar los datos"),
      ),
    ).toBe("verify_failed");
  });

  it("401 TICKET_EXPIRED → ticket; otro 401 → auth_required", () => {
    expect(claimPublicErrorKind(apiError(401, "TICKET_EXPIRED"))).toBe(
      "ticket_expired",
    );
    expect(claimPublicErrorKind(apiError(401, "AUTH_REQUIRED"))).toBe(
      "auth_required",
    );
  });

  it("404 → link inválido; 429 → throttle", () => {
    expect(claimPublicErrorKind(apiError(404))).toBe("invalid");
    expect(claimPublicErrorKind(apiError(429))).toBe("rate_limited");
  });

  it("409 distingue lock / no disponible / titular por mensaje", () => {
    expect(
      claimPublicErrorKind(
        apiError(409, "CONFLICT", "Demasiados intentos. Por seguridad…"),
      ),
    ).toBe("locked");
    expect(
      claimPublicErrorKind(
        apiError(409, "CONFLICT", "El reclamo ya no está disponible."),
      ),
    ).toBe("unavailable");
    expect(
      claimPublicErrorKind(
        apiError(
          409,
          "CONFLICT",
          "El vehículo ya tiene un titular registrado.",
        ),
      ),
    ).toBe("claim_blocked");
    expect(claimPublicErrorKind(apiError(409, "CONFLICT", "otro"))).toBe(
      "generic",
    );
  });

  it("410 distingue revocado / vencido por mensaje", () => {
    expect(
      claimPublicErrorKind(
        apiError(410, "GONE", "El dueño revocó este link."),
      ),
    ).toBe("revoked");
    expect(claimPublicErrorKind(apiError(410, "GONE", "ya no está vigente"))).toBe(
      "expired",
    );
  });

  it("5xx y otros → genérico", () => {
    expect(claimPublicErrorKind(apiError(500))).toBe("generic");
    expect(claimPublicErrorKind(apiError(403))).toBe("generic");
  });
});

describe("resolveClaimVerifyErrorMessage", () => {
  it("mapea a copy de UI, nunca al mensaje crudo", () => {
    expect(resolveClaimVerifyErrorMessage(apiError(400, "VALIDATION_ERROR"))).toBe(
      CLAIM_FORMAT_ERROR,
    );
    expect(resolveClaimVerifyErrorMessage(new Error("network"))).toBe(
      CLAIM_NETWORK_ERROR,
    );
    expect(
      resolveClaimVerifyErrorMessage(
        apiError(400, "CONFLICT", "No pudimos verificar los datos del vehículo."),
      ),
    ).toBe(CLAIM_VERIFY_ERROR);
  });

  it("un 409/410 durante verify cae al copy único de verificación", () => {
    expect(
      resolveClaimVerifyErrorMessage(
        apiError(409, "CONFLICT", "Demasiados intentos."),
      ),
    ).toBe(CLAIM_VERIFY_ERROR);
  });
});

describe("CLAIM_TERMINAL_COPY", () => {
  it("todas las kinds tienen título, cuerpo, ícono y variante válidos", () => {
    for (const [kind, copy] of Object.entries(CLAIM_TERMINAL_COPY)) {
      expect(copy.title, kind).toBeTruthy();
      expect(copy.body, kind).toBeTruthy();
      expect(["alert", "lock"], kind).toContain(copy.icon);
      expect(["single", "retry", "recover"], kind).toContain(copy.variant);
    }
  });

  it("locked y rate_limited usan el ícono lock; el resto alert", () => {
    expect(CLAIM_TERMINAL_COPY.locked.icon).toBe("lock");
    expect(CLAIM_TERMINAL_COPY.rate_limited.icon).toBe("lock");
    expect(CLAIM_TERMINAL_COPY.expired.icon).toBe("alert");
  });

  it("sólo generic tiene Reintentar (retry) y ticket_expired Verificar de nuevo (recover)", () => {
    expect(CLAIM_TERMINAL_COPY.generic.variant).toBe("retry");
    expect(CLAIM_TERMINAL_COPY.ticket_expired.variant).toBe("recover");
    expect(CLAIM_TERMINAL_COPY.invalid.variant).toBe("single");
  });
});

describe("isClaimAlreadyTaken", () => {
  it("detecta el 409 de create con titular", () => {
    expect(
      isClaimAlreadyTaken(
        apiError(409, "CONFLICT", "Este vehículo ya tiene titular; no se envió invitación."),
      ),
    ).toBe(true);
  });

  it("detecta el 409 de create por reason aunque el mensaje cambie", () => {
    expect(
      isClaimAlreadyTaken(
        apiError(409, "CONFLICT", "otro mensaje", {
          reason: "active_owner",
        }),
      ),
    ).toBe(true);
    expect(
      isClaimAlreadyTaken(
        apiError(409, "CONFLICT", "otro mensaje", {
          reason: "already_claimed",
        }),
      ),
    ).toBe(true);
  });

  it("no confunde otros 409 ni otros status", () => {
    expect(isClaimAlreadyTaken(apiError(409, "CONFLICT", "otro"))).toBe(false);
    expect(isClaimAlreadyTaken(apiError(400))).toBe(false);
    expect(isClaimAlreadyTaken(new Error("x"))).toBe(false);
  });
});

describe("resolveClaimPanelMessage", () => {
  it("resuelve las variantes con copy literal del spec (§2.14)", () => {
    expect(
      resolveClaimPanelMessage(
        apiError(409, "CONFLICT", "Todavía no hay una cuenta vinculada a este reclamo."),
      ),
    ).toBe(
      "Todavía no hay una cuenta vinculada a este reclamo.",
    );
    expect(
      resolveClaimPanelMessage(
        apiError(409, "CONFLICT", "Este reclamo está en revisión manual. Para rechazarlo, usá Rechazar."),
      ),
    ).toBe("Este reclamo está en revisión manual. Para rechazarlo, usá Rechazar.");
  });

  it("403 → sin permiso; 404 → no encontrado; resto → genérico de acción", () => {
    expect(resolveClaimPanelMessage(apiError(403))).toBe(
      "No tenés permiso para gestionar reclamos en este taller.",
    );
    expect(resolveClaimPanelMessage(apiError(404))).toBe(
      "No pudimos encontrar este reclamo.",
    );
    expect(resolveClaimPanelMessage(apiError(500))).toBe(
      "No pudimos completar la acción. Intentá de nuevo.",
    );
    expect(resolveClaimPanelMessage(new Error("sin status"))).toBe(
      "No pudimos completar la acción. Intentá de nuevo.",
    );
  });
});
