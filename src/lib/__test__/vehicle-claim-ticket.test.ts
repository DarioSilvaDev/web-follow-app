/**
 * F-1 — store en memoria del ticket de reclamo + decode del vehicleId.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearClaimTicket,
  decodeClaimTicketVehicleId,
  getClaimTicket,
  saveClaimTicket,
} from "@/lib/vehicle-claim-ticket";

const TOKEN = "abc123";

function makeTicket(vehicleId: string): string {
  const payload = btoa(
    JSON.stringify({ inviteId: "inv_1", vehicleId, purpose: "claim" }),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.sig`;
}

describe("claim ticket store", () => {
  beforeEach(() => {
    clearClaimTicket(TOKEN);
  });

  it("guarda, lee y borra el ticket por token", () => {
    expect(getClaimTicket(TOKEN)).toBeUndefined();
    saveClaimTicket(TOKEN, { ticket: "t1", licensePlate: "AB123CD" });
    expect(getClaimTicket(TOKEN)).toEqual({
      ticket: "t1",
      licensePlate: "AB123CD",
    });
    clearClaimTicket(TOKEN);
    expect(getClaimTicket(TOKEN)).toBeUndefined();
  });

  it("un ticket nuevo reemplaza al anterior (mismo token)", () => {
    saveClaimTicket(TOKEN, { ticket: "t1", licensePlate: "AA111AA" });
    saveClaimTicket(TOKEN, { ticket: "t2", licensePlate: "BB222BB" });
    expect(getClaimTicket(TOKEN)?.ticket).toBe("t2");
    clearClaimTicket(TOKEN);
  });

  it("los tokens son aislados entre sí", () => {
    saveClaimTicket(TOKEN, { ticket: "t1", licensePlate: "AA111AA" });
    expect(getClaimTicket("otro-token")).toBeUndefined();
    clearClaimTicket(TOKEN);
  });
});

describe("decodeClaimTicketVehicleId", () => {
  it("decodifica el vehicleId del payload del ticket", () => {
    expect(decodeClaimTicketVehicleId(makeTicket("veh_42"))).toBe("veh_42");
  });

  it("devuelve null para tickets malformados o sin vehicleId", () => {
    expect(decodeClaimTicketVehicleId("")).toBeNull();
    expect(decodeClaimTicketVehicleId("sin.puntos")).toBeNull();
    expect(decodeClaimTicketVehicleId("a.eyJmb28iOiJiYXIifQ.c")).toBeNull();
    expect(
      decodeClaimTicketVehicleId(`header.${btoa('{"other":1}').replace(/=+$/, "")}.sig`),
    ).toBeNull();
  });
});
