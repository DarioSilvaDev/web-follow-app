/**
 * Tests de `workshop-completeness.ts` — checklist derivado del perfil del
 * taller (DECISION-REGISTER PROD-004 / FR-006).
 *
 * El checklist es INFORMATIVO: el contrato a proteger acá es que se *deriva* de
 * los datos del taller, que no requiere backend adicional y que no tiene
 * estados imposibles (p. ej. "hay sede" nunca puede ser falso con ramas
 * presentes, porque la primera sucursal creada se marca sede por defecto).
 */

import { describe, expect, it } from "vitest";
import {
  computeWorkshopCompleteness,
  getWorkshopCompleteness,
  summarizeCompleteness,
  type CompletenessItem,
} from "@/lib/workshop-completeness";
import type { WorkshopBranch, WorkshopDetail } from "@/types/workshop";

type ProfileFields = Pick<
  WorkshopDetail,
  "email" | "phone" | "website" | "description" | "legalName" | "taxId"
>;

const EMPTY_PROFILE: ProfileFields = {
  email: null,
  phone: null,
  website: null,
  description: null,
  legalName: null,
  taxId: null,
};

function branch(overrides: Partial<WorkshopBranch> = {}): WorkshopBranch {
  return {
    id: overrides.id ?? "branch-1",
    workshopId: "workshop-1",
    name: "Sede Central",
    phone: null,
    email: null,
    street: null,
    streetNumber: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    isHeadquarters: true,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as WorkshopBranch;
}

function profile(overrides: Partial<ProfileFields>): ProfileFields {
  return { ...EMPTY_PROFILE, ...overrides };
}

function itemById(items: CompletenessItem[], id: string): CompletenessItem {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`item inexistente: ${id}`);
  return found;
}

describe("computeWorkshopCompleteness", () => {
  it("marca todo pendiente cuando el taller no tiene ningún dato", () => {
    const items = computeWorkshopCompleteness(profile({}));
    expect(items.every((item) => item.complete === false)).toBe(true);
  });

  it("exige email Y teléfono para dar por completo el contacto", () => {
    const soloEmail = computeWorkshopCompleteness(profile({ email: "a@b.com" }));
    expect(itemById(soloEmail, "contact").complete).toBe(false);

    const ambos = computeWorkshopCompleteness(
      profile({ email: "a@b.com", phone: "112233" }),
    );
    expect(itemById(ambos, "contact").complete).toBe(true);
  });

  it("acepta razón social o CUIT indistintamente", () => {
    const conRazon = computeWorkshopCompleteness(
      profile({ legalName: "Taller SA" }),
    );
    expect(itemById(conRazon, "legal-identity").complete).toBe(true);

    const conCuit = computeWorkshopCompleteness(profile({ taxId: "30-1-1" }));
    expect(itemById(conCuit, "legal-identity").complete).toBe(true);
  });

  it("no cuenta como dato un valor de espacios en blanco", () => {
    const items = computeWorkshopCompleteness(
      profile({ email: "   ", website: "  ", description: " " }),
    );
    expect(itemById(items, "contact").complete).toBe(false);
    expect(itemById(items, "website").complete).toBe(false);
    expect(itemById(items, "description").complete).toBe(false);
  });

  it("no considera sede a un taller sin sucursales", () => {
    const items = computeWorkshopCompleteness(profile({}));
    expect(itemById(items, "headquarters").complete).toBe(false);
    expect(itemById(items, "headquarters-contact").complete).toBe(false);
  });

  it("no considera sede a un taller cuya única sucursal no es la sede", () => {
    const items = computeWorkshopCompleteness({
      ...profile({}),
      branches: [branch({ isHeadquarters: false })],
    });
    expect(itemById(items, "headquarters").complete).toBe(false);
  });

  it("da por completa la sede cuando existe una sucursal marcada como sede", () => {
    const items = computeWorkshopCompleteness({
      ...profile({}),
      branches: [
        branch({ id: "b1", isHeadquarters: false }),
        branch({ id: "b2", isHeadquarters: true }),
      ],
    });
    expect(itemById(items, "headquarters").complete).toBe(true);
  });

  it("exige teléfono O email de contacto en la sede", () => {
    const sinContacto = computeWorkshopCompleteness({
      ...profile({}),
      branches: [branch({ phone: null, email: null })],
    });
    expect(itemById(sinContacto, "headquarters-contact").complete).toBe(false);

    const conTelefono = computeWorkshopCompleteness({
      ...profile({}),
      branches: [branch({ phone: "112233" })],
    });
    expect(itemById(conTelefono, "headquarters-contact").complete).toBe(true);

    const conEmail = computeWorkshopCompleteness({
      ...profile({}),
      branches: [branch({ email: "sede@taller.com" })],
    });
    expect(itemById(conEmail, "headquarters-contact").complete).toBe(true);
  });

  it("ignora las sucursales no sede al evaluar el contacto de la sede", () => {
    const items = computeWorkshopCompleteness({
      ...profile({}),
      branches: [
        branch({ id: "b1", isHeadquarters: true, phone: null, email: null }),
        branch({ id: "b2", isHeadquarters: false, phone: "112233" }),
      ],
    });
    expect(itemById(items, "headquarters-contact").complete).toBe(false);
  });

  it("trata branches ausente (respuesta del PATCH) como taller sin sucursales", () => {
    const items = computeWorkshopCompleteness(profile({}));
    expect(itemById(items, "headquarters").complete).toBe(false);
  });

  it("expone siempre los mismos ítems, en el mismo orden", () => {
    const vacio = computeWorkshopCompleteness(profile({}));
    const lleno = computeWorkshopCompleteness({
      ...profile({
        email: "a@b.com",
        phone: "112233",
        website: "taller.com",
        description: "Service",
        legalName: "SA",
        taxId: "30-1-1",
      }),
      branches: [branch({ phone: "112233" })],
    });
    expect(vacio.map((item) => item.id)).toEqual(
      lleno.map((item) => item.id),
    );
    expect(vacio).toHaveLength(6);
  });

  it("expone el copy de completitud en todos los ítems, completos o no", () => {
    // El copy se declara siempre para que cualquier consumidor pueda usarlo;
    // el card decide no renderizarlo cuando el ítem ya está completo.
    const items = computeWorkshopCompleteness(
      profile({ email: "a@b.com", phone: "112233" }),
    );
    const contact = itemById(items, "contact");
    expect(contact.complete).toBe(true);
    expect(contact.hint).not.toBe("");
    expect(items.every((item) => item.hint.length > 0)).toBe(true);
  });
});

describe("summarizeCompleteness", () => {
  it("cuenta completados sobre el total", () => {
    const items = computeWorkshopCompleteness(
      profile({ email: "a@b.com", phone: "112233" }),
    );
    const summary = summarizeCompleteness(items);
    expect(summary.completed).toBe(1);
    expect(summary.total).toBe(6);
    expect(summary.percent).toBe(17);
    expect(summary.isComplete).toBe(false);
  });

  it("marca isComplete cuando no queda ningún ítem pendiente", () => {
    const items = computeWorkshopCompleteness({
      ...profile({
        email: "a@b.com",
        phone: "112233",
        website: "taller.com",
        description: "Service",
        legalName: "SA",
      }),
      branches: [branch({ phone: "112233" })],
    });
    const summary = summarizeCompleteness(items);
    expect(summary.completed).toBe(summary.total);
    expect(summary.percent).toBe(100);
    expect(summary.isComplete).toBe(true);
  });

  it("reporta 0% y no completo ante una lista vacía", () => {
    const summary = summarizeCompleteness([]);
    expect(summary.percent).toBe(0);
    expect(summary.isComplete).toBe(false);
    expect(summary.total).toBe(0);
  });
});

describe("getWorkshopCompleteness", () => {
  it("es el atajo equivalente a compute + summarize", () => {
    const workshop = { ...profile({ email: "a@b.com" }), branches: [] };
    const viaAtajo = getWorkshopCompleteness(workshop);
    const viaPipeline = summarizeCompleteness(
      computeWorkshopCompleteness(workshop),
    );
    expect(viaAtajo).toEqual(viaPipeline);
  });

  it("acepta un WorkshopDetail completo", () => {
    const detail = {
      id: "workshop-1",
      name: "Taller Central",
      email: "a@b.com",
      phone: "112233",
      website: "taller.com",
      description: "Service",
      legalName: "SA",
      taxId: "30-12345678-9",
      branches: [branch({ phone: "112233" })],
    } as unknown as WorkshopDetail;

    const summary = getWorkshopCompleteness(detail);
    expect(summary.isComplete).toBe(true);
  });
});