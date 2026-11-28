/**
 * Control de formato de patente — vectores de prueba.
 *
 * Regla: 3.er carácter LETRA → `AAA111` (3 letras + 3 dígitos);
 * 3.er carácter NÚMERO → `AA111AA` (2 letras + 3 dígitos + 2 letras).
 */
import { describe, it, expect } from "vitest";
import {
  LICENSE_PLATE_FORMAT_ERROR,
  detectLicensePlateFormat,
  formatLicensePlateInput,
  isValidLicensePlate,
  normalizeLicensePlate,
} from "@/lib/license-plate";

/** Patente vieja válida: 3 letras + 3 dígitos. */
const VALID_OLD = ["AAA111", "ABC123", "XYZ789", "QWE234", "BCD234"];

/** Patente nueva válida: 2 letras + 3 dígitos + 2 letras. */
const VALID_NEW = ["AA111AA", "AB123CD", "AC456DE", "AD234EF", "AB012CD"];

/** Todo lo que la regla de formato debe rechazar. */
const INVALID = [
  "", // vacía
  "AB", // demasiado corta
  "ABC12", // 5 caracteres (vieja incompleta)
  "AB123C", // 6 caracteres con 3.er dígito → nueva incompleta
  "ABC1234", // 7 caracteres con 3.er letra → vieja de más
  "AB12345", // 8 caracteres
  "ABC123X", // 3.er letra → vieja, pero tiene 7 caracteres (de más)
  "AB1234C", // 3.er dígito → nueva, pero el 6to carácter debe ser letra
  "A1234BC", // 3.er dígito → nueva, pero empieza con dígito
  "1BC234D", // 3.er letra → vieja, pero empieza con dígito
  "AB-123C", // guion
  "AB 123C", // espacio interno
  "ABC12-", // corta con guion final
  "AB123C!", // carácter inválido
];

describe("license-plate", () => {
  describe("normalizeLicensePlate", () => {
    it("trims and uppercases", () => {
      expect(normalizeLicensePlate("  ab123cd  ")).toBe("AB123CD");
    });

    it("is idempotent", () => {
      const once = normalizeLicensePlate(" abc123 ");
      expect(normalizeLicensePlate(once)).toBe(once);
    });
  });

  describe("detectLicensePlateFormat", () => {
    it.each(VALID_OLD)("detects %s as AAA111 (3rd char is a letter)", (plate) => {
      expect(detectLicensePlateFormat(plate)).toBe("AAA111");
    });

    it.each(VALID_NEW)("detects %s as AA111AA (3rd char is a digit)", (plate) => {
      expect(detectLicensePlateFormat(plate)).toBe("AA111AA");
    });

    it("normalizes lowercase input before detecting", () => {
      expect(detectLicensePlateFormat(" ab123cd ")).toBe("AA111AA");
      expect(detectLicensePlateFormat("abc123")).toBe("AAA111");
    });

    it.each(INVALID)("rejects %j", (plate) => {
      expect(detectLicensePlateFormat(plate)).toBeNull();
    });

    it("rejects a plate whose 3rd char is neither letter nor digit", () => {
      expect(detectLicensePlateFormat("AB-234CD")).toBeNull();
    });
  });

  describe("isValidLicensePlate", () => {
    it.each([...VALID_OLD, ...VALID_NEW])("accepts %s", (plate) => {
      expect(isValidLicensePlate(plate)).toBe(true);
    });

    it.each(INVALID)("rejects %j", (plate) => {
      expect(isValidLicensePlate(plate)).toBe(false);
    });

    it("accepts lowercase and surrounding whitespace after normalizing", () => {
      expect(isValidLicensePlate("  abc123 ")).toBe(true);
      expect(isValidLicensePlate(" ab123cd ")).toBe(true);
    });

    it("rejects a partial plate while typing (incomplete format)", () => {
      expect(isValidLicensePlate("AB1")).toBe(false);
      expect(isValidLicensePlate("ABC")).toBe(false);
    });
  });

  describe("formatLicensePlateInput — formateo progresivo del buscador", () => {
    it("fuerza MAYÚSCULAS y exige dos letras al inicio", () => {
      expect(formatLicensePlateInput("fk")).toBe("FK");
      expect(formatLicensePlateInput("f")).toBe("F");
      // Los dígitos previos a las dos letras se descartan.
      expect(formatLicensePlateInput("1f2k")).toBe("FK");
    });

    it("3.er carácter dígito → formato nuevo AA111AA", () => {
      expect(formatLicensePlateInput("fk1")).toBe("FK1");
      expect(formatLicensePlateInput("fk12")).toBe("FK12");
      expect(formatLicensePlateInput("fk123ab")).toBe("FK123AB");
    });

    it("3.er carácter letra → formato viejo AAA111", () => {
      expect(formatLicensePlateInput("fka")).toBe("FKA");
      expect(formatLicensePlateInput("fka1")).toBe("FKA1");
      expect(formatLicensePlateInput("fka123")).toBe("FKA123");
    });

    it("descarta caracteres fuera de orden y limita a 6", () => {
      expect(formatLicensePlateInput("fk1a2b3")).toBe("FK123");
      expect(formatLicensePlateInput("fka1b2c3")).toBe("FKA123");
      expect(formatLicensePlateInput("fk123ab9")).toBe("FK123AB");
      expect(formatLicensePlateInput("fka1234")).toBe("FKA123");
    });

    it("ignora caracteres inválidos (espacios, guiones, símbolos)", () => {
      expect(formatLicensePlateInput("fk-123 ab!")).toBe("FK123AB");
      expect(formatLicensePlateInput(" f k a 1 2 3 ")).toBe("FKA123");
    });

    it("es idempotente y produce una patente válida cuando está completa", () => {
      for (const plate of ["FK123AB", "FKA123"]) {
        expect(formatLicensePlateInput(plate)).toBe(plate);
        expect(isValidLicensePlate(formatLicensePlateInput(plate))).toBe(true);
      }
    });
  });

  it("exposes the shared format error copy", () => {
    expect(LICENSE_PLATE_FORMAT_ERROR).toBe(
      "La patente debe tener el formato AAA111 o AA111AA.",
    );
  });
});
