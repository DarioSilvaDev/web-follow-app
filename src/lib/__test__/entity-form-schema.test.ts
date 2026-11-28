/**
 * Tests de los validadores compartidos (`entity-form-schema.ts`).
 * Extraídos del formulario de perfil para testear la frontera de UX sin React.
 */

import { describe, expect, it } from "vitest";
import {
  optionalCuit,
  optionalEmail,
  optionalText,
} from "@/lib/entity-form-schema";

describe("optionalText", () => {
  const schema = optionalText(200, "La descripción");

  it("acepta vacío como 'sin valor'", () => {
    expect(schema.parse("")).toBe("");
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("hace trim y rechaza más del máximo con el mensaje parametrizado", () => {
    expect(schema.parse("  hola  ")).toBe("hola");
    expect(() => schema.parse("x".repeat(201))).toThrow(
      "La descripción no puede superar los 200 caracteres.",
    );
  });

  it("respeta el máximo que se le pasa (no unifica contratos)", () => {
    expect(() => optionalText(30, "El teléfono").parse("x".repeat(31))).toThrow(
      "El teléfono no puede superar los 30 caracteres.",
    );
  });
});

describe("optionalEmail", () => {
  const schema = optionalEmail();

  it("acepta vacío, hace trim y valida el formato", () => {
    expect(schema.parse("")).toBe("");
    expect(schema.parse("  dueno@taller.com  ")).toBe("dueno@taller.com");
    expect(() => schema.parse("no-es-email")).toThrow("Ingresá un email válido.");
  });

  it("permite customizar el mensaje", () => {
    expect(() => optionalEmail("Email del dueño inválido.").parse("x")).toThrow(
      "Email del dueño inválido.",
    );
  });
});

describe("optionalCuit", () => {
  const schema = optionalCuit();

  it("acepta vacío y CUITs sintácticamente válidos con o sin guiones", () => {
    expect(schema.parse("")).toBe("");
    expect(schema.parse("30-12345678-1")).toBe("30-12345678-1");
    expect(schema.parse("30123456781")).toBe("30123456781");
    expect(schema.parse("30-12345679-9")).toBe("30-12345679-9");
  });

  it("rechaza dígito verificador incorrecto y longitud inválida", () => {
    expect(() => schema.parse("30-12345678-0")).toThrow(
      "El CUIT no es válido. Revisá los 11 dígitos.",
    );
    expect(() => schema.parse("30-1234")).toThrow(
      "El CUIT no es válido. Revisá los 11 dígitos.",
    );
  });
});
