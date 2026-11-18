/**
 * Plan 05 — F-TZ-1/F-TZ-2: `formatDateOnly` (fecha calendario, UTC) vs
 * `formatDate`/`formatDateTime` (instantes, hora local).
 *
 * Estrategia de timezone (C4): `vitest.config.ts` pinnea `test.env.TZ` a
 * `America/Argentina/Buenos_Aires`. Vitest no permite TZ por suite, así que
 * este archivo incluye **guarda de entorno**: si alguien corre la suite sin el
 * pin, el test falla explícitamente en vez de dar un falso verde en UTC.
 *
 * Aserciones por componentes (`/11/`, `/nov/i`, `/2026/`) y nunca el string
 * literal de `Intl`: el ICU del repo (Node/happy-dom) rinde "11 de nov de 2026"
 * (ver `admin-status.test.ts:174-182`).
 */
import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  toDateOnly,
} from "@/lib/format-date";

describe("entorno de tests (guarda de TZ — Plan 05 / C4)", () => {
  it("la suite corre en UTC-3 (Buenos Aires), no en UTC", () => {
    // Node/ICU canonicaliza el ID: en Windows rinde `America/Buenos_Aires`
    // (alias del mismo zoneinfo). Se aceptan ambos y se verifica el offset
    // real, que es lo que hace pasar o fallar los asserts de día.
    expect([
      "America/Argentina/Buenos_Aires",
      "America/Buenos_Aires",
    ]).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    // getTimezoneOffset() devuelve minutos al oeste de UTC: UTC-3 → 180.
    expect(new Date("2026-11-11T00:00:00.000Z").getTimezoneOffset()).toBe(180);
  });
});

describe("formatDateOnly (Plan 05 / D-TZ-6, D-TZ-7)", () => {
  it("'2026-11-11' y su medianoche UTC rinden el MISMO día calendario (11, nunca 10)", () => {
    const fromDateOnly = formatDateOnly("2026-11-11");
    const fromMidnight = formatDateOnly("2026-11-11T00:00:00.000Z");

    expect(fromDateOnly).toBe(fromMidnight);
    expect(fromDateOnly).toMatch(/\b11\b/);
    expect(fromDateOnly).toMatch(/nov/i);
    expect(fromDateOnly).toMatch(/2026/);
    expect(fromDateOnly).not.toMatch(/\b10\b/);
  });

  it("acepta las variantes de medianoche UTC del wire (sin ms / con ms / +00:00)", () => {
    const expected = formatDateOnly("2026-11-11");

    expect(formatDateOnly("2026-11-11T00:00:00Z")).toBe(expected);
    expect(formatDateOnly("2026-11-11T00:00:00.000Z")).toBe(expected);
    expect(formatDateOnly("2026-11-11T00:00:00+00:00")).toBe(expected);
  });

  it("NO trunca un instante real: '2026-11-11T15:30:00.000Z' → '—' (R3)", () => {
    expect(formatDateOnly("2026-11-11T15:30:00.000Z")).toBe("—");
  });

  it("NO trunca un ISO con offset no-UTC ('2026-11-11T23:00:00-03:00' → '—')", () => {
    expect(formatDateOnly("2026-11-11T23:00:00-03:00")).toBe("—");
  });

  it("null / undefined / '' / no-fecha → '—'", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly(undefined)).toBe("—");
    expect(formatDateOnly("")).toBe("—");
    expect(formatDateOnly("no-es-una-fecha")).toBe("—");
    expect(formatDateOnly("11/11/2026")).toBe("—");
  });

  it("fechas fuera de calendario → '—' (no inventa un día por normalización del engine)", () => {
    expect(formatDateOnly("2026-02-30")).toBe("—");
    expect(formatDateOnly("2026-13-01")).toBe("—");
  });

  it("es independiente de la TZ del cliente (mismo día en UTC-3 y en UTC)", () => {
    // Comparación contra el día esperado calculado en UTC, sin depender del
    // formateo del proceso: si el helper aplicara hora local, en UTC-3 daría 10.
    const utcDay = new Date("2026-11-11T00:00:00.000Z").getUTCDate();
    expect(utcDay).toBe(11);
    expect(formatDateOnly("2026-11-11")).toMatch(/\b11\b/);
  });

  it("style 'numeric' rinde dd/mm/yyyy en UTC (consistencia con instantes del historial)", () => {
    expect(formatDateOnly("2026-11-11", "numeric")).toBe("11/11/2026");
    // Medianoche UTC del wire: mismo día calendario, no el 10 local.
    expect(formatDateOnly("2026-11-11T00:00:00.000Z", "numeric")).toBe(
      "11/11/2026",
    );
    // El default sigue siendo el formato corto con mes en letras.
    expect(formatDateOnly("2026-11-11")).not.toBe("11/11/2026");
    expect(formatDateOnly("2026-11-11", "short")).toMatch(/nov/i);
    // Sigue sin truncar instantes reales.
    expect(formatDateOnly("2026-11-11T15:30:00.000Z", "numeric")).toBe("—");
  });
});

describe("toDateOnly (Plan 05 / F-TZ-6)", () => {
  it("normaliza a 'YYYY-MM-DD' las formas date-only y medianoche UTC", () => {
    expect(toDateOnly("2026-11-11")).toBe("2026-11-11");
    expect(toDateOnly("2026-11-11T00:00:00.000Z")).toBe("2026-11-11");
    expect(toDateOnly("2026-11-11T00:00:00Z")).toBe("2026-11-11");
  });

  it("un instante con hora real no es fecha calendario → null (nunca se trunca)", () => {
    expect(toDateOnly("2026-11-11T09:00:00.000Z")).toBeNull();
    expect(toDateOnly("2026-11-11T15:30:00.000Z")).toBeNull();
  });

  it("valores vacíos o inválidos → null", () => {
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeNull();
    expect(toDateOnly("")).toBeNull();
    expect(toDateOnly("2026-02-30")).toBeNull();
    expect(toDateOnly("11/11/2026")).toBeNull();
  });
});

describe("formatDate / formatDateTime (instantes — sin cambios, Plan 05 §10)", () => {
  it("formatDate sigue formateando en hora local (medianoche UTC → día 10 en UTC-3)", () => {
    // Guarda de entorno arriba: sin ella, en UTC este assert sería "11" y el
    // test pasaría en falso. Es exactamente el bug que formatDateOnly corrige.
    expect(formatDate("2026-11-11T00:00:00.000Z")).toMatch(/\b10\b/);
    expect(formatDate("2026-11-11T00:00:00.000Z")).not.toMatch(/\b11\b/);
  });

  it("formatDateTime conserva la hora local", () => {
    expect(formatDateTime("2026-11-11T14:30:00.000Z")).toMatch(/\b11\b/);
    expect(formatDateTime("2026-11-11T14:30:00.000Z")).toMatch(/11:30/);
  });

  it("inputs inválidos → '—' en ambos", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDate("no-es-una-fecha")).toBe("—");
  });
});
