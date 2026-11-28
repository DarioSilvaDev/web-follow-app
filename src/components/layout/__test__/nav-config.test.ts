/**
 * nav-config — resolución del item de talleres.
 *
 * Regla: con EXACTAMENTE una membresía activa, el nav apunta directo a
 * `/workshops/<id>` (label "Mi taller") para evitar el hop por la lista. Con 0
 * o ≥2 membresías se mantiene `/workshops` (label "Talleres") como selector.
 */
import { describe, expect, it } from "vitest";
import {
  buildNavSections,
  isNavItemActive,
  navItemAriaCurrent,
} from "@/components/layout/nav-config";

function workshopItem(singleWorkshopId?: string | null) {
  const sections = buildNavSections({
    hasWorkshops: true,
    singleWorkshopId,
    hasDealerships: false,
    isAdmin: false,
  });
  return sections
    .flatMap((section) => section.items)
    .find((item) => item.label === "Mi taller" || item.label === "Talleres");
}

describe("buildNavSections — item de talleres", () => {
  it("sin membresías no renderiza item de talleres", () => {
    const sections = buildNavSections({
      hasWorkshops: false,
      hasDealerships: false,
      isAdmin: false,
    });
    const labels = sections.flatMap((section) =>
      section.items.map((item) => item.label),
    );
    expect(labels).not.toContain("Talleres");
    expect(labels).not.toContain("Mi taller");
  });

  it("con un solo taller apunta directo y usa label 'Mi taller'", () => {
    const item = workshopItem("w1");
    expect(item?.label).toBe("Mi taller");
    expect(item?.href).toBe("/workshops/w1");
  });

  it("con varios talleres mantiene la lista y el label 'Talleres'", () => {
    const item = workshopItem(null);
    expect(item?.label).toBe("Talleres");
    expect(item?.href).toBe("/workshops");
  });

  it("ignora un id vacío (cae al listado)", () => {
    const item = workshopItem("   ");
    expect(item?.label).toBe("Talleres");
    expect(item?.href).toBe("/workshops");
  });
});

describe("isNavItemActive — taller único", () => {
  const item = workshopItem("w1")!;

  it("marca activo el detalle del taller y sus subrutas", () => {
    expect(isNavItemActive("/workshops/w1", item)).toBe(true);
    expect(isNavItemActive("/workshops/w1/especialidades", item)).toBe(true);
  });

  it("no marca activo el listado genérico ni otro taller", () => {
    expect(isNavItemActive("/workshops", item)).toBe(false);
    expect(isNavItemActive("/workshops/w2", item)).toBe(false);
  });

  it("aria-current es 'page' solo en el match exacto", () => {
    expect(navItemAriaCurrent("/workshops/w1", item)).toBe("page");
    expect(navItemAriaCurrent("/workshops/w1/especialidades", item)).toBe(
      "true",
    );
  });
});
