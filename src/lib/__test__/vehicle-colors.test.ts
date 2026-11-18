/**
 * Colores de vehículo (es → hex) — el backend guarda el color como texto libre;
 * CSS no entiende español, así que los dots necesitan este mapa.
 * Regla: nombre desconocido → undefined (el llamador renderiza el círculo
 * sin relleno; nunca un color aproximado).
 */
import { describe, it, expect } from "vitest";
import { vehicleColorHex } from "@/lib/vehicle-colors";

describe("vehicleColorHex", () => {
  it("mapea colores comunes en español a hex", () => {
    expect(vehicleColorHex("Rojo")).toBe("#d32f2f");
    expect(vehicleColorHex("Negro")).toBe("#1a1a1a");
    expect(vehicleColorHex("Blanco")).toBe("#f5f5f5");
    expect(vehicleColorHex("Azul marino")).toBe("#163a5f");
    expect(vehicleColorHex("Gris")).toBe("#6b7280");
    expect(vehicleColorHex("Plateado")).toBe("#c0c0c0");
  });

  it("es case/accent-insensitive y tolera espacios extra", () => {
    expect(vehicleColorHex("  ROJO  ")).toBe("#d32f2f");
    expect(vehicleColorHex("Marrón")).toBe("#6f4e37");
    expect(vehicleColorHex("MARRON")).toBe("#6f4e37");
    expect(vehicleColorHex("gris  oscuro")).toBe("#374151");
  });

  it("sin match conocido o vacío → undefined", () => {
    expect(vehicleColorHex("Beige Perlado Pearlado")).toBeUndefined();
    expect(vehicleColorHex("verdoso")).toBeUndefined();
    expect(vehicleColorHex("")).toBeUndefined();
    expect(vehicleColorHex(null)).toBeUndefined();
    expect(vehicleColorHex(undefined)).toBeUndefined();
  });
});
