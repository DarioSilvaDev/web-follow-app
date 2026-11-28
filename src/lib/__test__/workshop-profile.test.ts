/**
 * Tests de los mapeos puros del perfil del taller.
 * Cubren que la refactorización no cambió el contrato PATCH ni la forma en que
 * se muestra el CUIT (BE-005: no normalizar a solo dígitos en el payload).
 */

import { describe, expect, it } from "vitest";
import {
  toFormValues,
  toSubmitValues,
  toUpdateWorkshopPayload,
} from "@/lib/workshop-profile";
import type { WorkshopDetail } from "@/types/workshop";

const workshop: WorkshopDetail = {
  id: "w1",
  name: "  Lo de Darío  ",
  legalName: null,
  taxId: "30123456781",
  email: null,
  phone: " +543364687486 ",
  website: null,
  logoUrl: null,
  description: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("toFormValues", () => {
  it("muestra el CUIT con guiones y los nulos como cadena vacía", () => {
    expect(toFormValues(workshop)).toEqual({
      name: "  Lo de Darío  ",
      legalName: "",
      taxId: "30-12345678-1",
      email: "",
      phone: " +543364687486 ",
      website: "",
      description: "",
    });
  });

  it("es idempotente sobre un CUIT ya formateado", () => {
    const values = toFormValues(workshop);
    expect(toFormValues({ ...workshop, taxId: values.taxId ?? null }).taxId).toBe(
      "30-12345678-1",
    );
  });
});

describe("toSubmitValues", () => {
  it("hace trim de todos los campos y conserva los guiones del CUIT", () => {
    expect(toSubmitValues(toFormValues(workshop))).toEqual({
      name: "Lo de Darío",
      legalName: "",
      taxId: "30-12345678-1",
      email: "",
      phone: "+543364687486",
      website: "",
      description: "",
    });
  });
});

describe("toUpdateWorkshopPayload", () => {
  it("envía los 7 campos y convierte los vacíos en null", () => {
    expect(toUpdateWorkshopPayload(toFormValues(workshop))).toEqual({
      name: "Lo de Darío",
      legalName: null,
      // Sin normalizar: el formato con guiones es el que hoy envía el frontend.
      taxId: "30-12345678-1",
      email: null,
      phone: "+543364687486",
      website: null,
      description: null,
    });
  });

  it("no inventa campos (ni reason, ni flags de visibilidad)", () => {
    const payload = toUpdateWorkshopPayload(toFormValues(workshop));
    expect(Object.keys(payload).sort()).toEqual([
      "description",
      "email",
      "legalName",
      "name",
      "phone",
      "taxId",
      "website",
    ]);
  });
});
