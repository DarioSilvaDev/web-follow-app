/**
 * Tests de `cuit.ts` — validación sintáctica de CUIT (ARG).
 *
 * Producto: DECISION-REGISTER PROD-002 (CUIT editable con validación).
 * Alcance deliberado: forma + dígito verificador. NO se valida existencia ante
 * AFIP/ARCA (EP-3 = no en el MVP), así que ningún test debe afirmar eso.
 */

import { describe, expect, it } from "vitest";
import { formatCuit, isValidCuit } from "@/lib/cuit";

describe("isValidCuit", () => {
  it("acepta un CUIT válido de persona jurídica con guiones", () => {
    expect(isValidCuit("30-12345678-1")).toBe(true);
  });

  it("acepta el mismo CUIT sin guiones", () => {
    expect(isValidCuit("30123456781")).toBe(true);
  });

  it("acepta CUITs de distintos prefijos (20, 23, 24, 27, 30, 33, 34)", () => {
    for (const cuit of [
      "20-12345678-6",
      "23-12345678-5",
      "24-12345678-1",
      "27-12345678-0",
      "30-12345678-1",
      "33-12345678-0",
      "34-12345678-7",
    ]) {
      expect(isValidCuit(cuit)).toBe(true);
    }
  });

  it("rechaza longitud incorrecta", () => {
    expect(isValidCuit("")).toBe(false);
    expect(isValidCuit("30-1234567-1")).toBe(false);
    expect(isValidCuit("30-123456789-1")).toBe(false);
  });

  it("rechaza un dígito verificador incorrecto", () => {
    // Mismo número base, dígito verificador alterado.
    expect(isValidCuit("30-12345678-0")).toBe(false);
  });

  it("rechaza letras u otros caracteres no numéricos", () => {
    expect(isValidCuit("30-1234567A-1")).toBe(false);
    expect(isValidCuit("ab-12345678-1")).toBe(false);
  });

  it("cubre el resto 10, que se mapea al dígito verificador 9", () => {
    // "3012345679": suma ponderada 155, 155 % 11 = 1 → 11-1 = 10, que no es
    // representable; la ARCA usa 9 para estos casos.
    expect(isValidCuit("30-12345679-9")).toBe(true);
    // El 10 crudo nunca debe aceptarse como dígito verificador.
    expect(isValidCuit("30-12345679-0")).toBe(false);
  });

  it("cubre el resto 0, que se mapea al dígito verificador 0", () => {
    // "2712345678": suma ponderada 176, 176 % 11 = 0 → 11-0 = 11 → 0.
    expect(isValidCuit("27-12345678-0")).toBe(true);
    expect(isValidCuit("27-12345678-1")).toBe(false);
  });
});

describe("formatCuit", () => {
  it("inserta los guiones en la forma XX-XXXXXXXX-X", () => {
    expect(formatCuit("30123456781")).toBe("30-12345678-1");
  });

  it("es idempotente sobre un valor ya formateado", () => {
    expect(formatCuit("30-12345678-1")).toBe("30-12345678-1");
  });

  it("devuelve el input original mientras no tiene 11 dígitos (typing parcial)", () => {
    expect(formatCuit("30")).toBe("30");
    expect(formatCuit("30-1234")).toBe("30-1234");
    expect(formatCuit("")).toBe("");
  });

  it("compone con isValidCuit", () => {
    expect(isValidCuit(formatCuit("30123456781"))).toBe(true);
  });
});