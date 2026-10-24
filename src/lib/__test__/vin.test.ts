/**
 * VIN validator — shared test vectors (D-04 / D-145).
 *
 * These vectors MUST stay identical to the backend suite
 * (`api-follow-app/src/common/validation/vin.spec.ts`). Running the same
 * vectors on both sides is the mechanism that detects mirror drift, so a
 * change here is a contract change and requires the backend fixture to move
 * in lockstep.
 *
 * DEPENDENCY: the backend file/vectors were not available when this suite was
 * written. Vectors below are derived from the D-145 format rule (17 chars,
 * `[A-HJ-NPR-Z0-9]`, excludes I/O/Q). Re-sync once the backend publishes its
 * fixture.
 */
import { describe, it, expect } from "vitest";
import { VIN_LENGTH, isValidVin, normalizeVin } from "@/lib/vin";

/** 17-char, allowed alphabet, no I/O/Q. */
const VALID_VINS = [
  "1HGCM82633A004352",
  "JH4KA7561PC008269",
  "WVWZZZ1JZ3W386752",
];

/** Anything the format rule must reject. */
const INVALID_VINS = [
  "", // empty
  "1HGCM82633A00435", // 16 chars
  "1HGCM82633A0043521", // 18 chars
  "1HGCM82633A00435I", // contains I
  "1HGCM82633A00435O", // contains O
  "1HGCM82633A00435Q", // contains Q
  "1HGCM82633A004-52", // invalid hyphen
  "1HGCM82633A 04352", // internal space
  "WVW123", // legacy short VIN (must NOT be accepted by format rule)
];

describe("vin", () => {
  it("exposes the canonical VIN length", () => {
    expect(VIN_LENGTH).toBe(17);
  });

  describe("normalizeVin", () => {
    it("trims and uppercases", () => {
      expect(normalizeVin("  wvwzzz1jz3w386752  ")).toBe("WVWZZZ1JZ3W386752");
    });

    it("is idempotent", () => {
      const once = normalizeVin(" 1hgcm82633a004352 ");
      expect(normalizeVin(once)).toBe(once);
    });
  });

  describe("isValidVin", () => {
    it.each(VALID_VINS)("accepts %s", (vin) => {
      expect(isValidVin(vin)).toBe(true);
    });

    it.each(INVALID_VINS)("rejects %j", (vin) => {
      expect(isValidVin(vin)).toBe(false);
    });

    it("accepts lowercase input after normalizing", () => {
      expect(isValidVin("1hgcm82633a004352")).toBe(true);
    });

    it("accepts surrounding whitespace after normalizing", () => {
      expect(isValidVin("  JH4KA7561PC008269 ")).toBe(true);
    });
  });
});
