/**
 * `?next=` allowlist (D-12 §8) — open-redirect protection for auth pages.
 */
import { describe, it, expect } from "vitest";
import { isSafeNextPath, resolveSafeNext } from "@/lib/auth-redirect";

describe("isSafeNextPath", () => {
  it("accepts the QR deep link", () => {
    expect(isSafeNextPath("/transfer/qr/TOKEN123")).toBe(true);
    expect(isSafeNextPath("/transfer/qr/abc-DEF_1.2~3")).toBe(true);
  });

  it("rejects arbitrary internal routes (not deep links)", () => {
    expect(isSafeNextPath("/vehicles/v1")).toBe(false);
    expect(isSafeNextPath("/dashboard")).toBe(false);
    expect(isSafeNextPath("/admin/users")).toBe(false);
    expect(isSafeNextPath("/transfer/qr")).toBe(false); // no token segment
    expect(isSafeNextPath("/transfer/qr/")).toBe(false); // empty token
  });

  it("rejects absolute and protocol-relative URLs (open redirect)", () => {
    expect(isSafeNextPath("https://evil.example/phish")).toBe(false);
    expect(isSafeNextPath("//evil.example")).toBe(false);
    expect(isSafeNextPath("/\\evil.example")).toBe(false);
    expect(isSafeNextPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty / nullish values", () => {
    expect(isSafeNextPath("")).toBe(false);
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath(undefined)).toBe(false);
  });

  it("rejects tokens with unsafe characters", () => {
    expect(isSafeNextPath("/transfer/qr/a b")).toBe(false);
    expect(isSafeNextPath("/transfer/qr/a/b")).toBe(false);
    expect(isSafeNextPath("/transfer/qr/%2Fetc")).toBe(false);
  });
});

describe("resolveSafeNext", () => {
  it("returns the deep link when safe", () => {
    expect(resolveSafeNext("/transfer/qr/TOKEN123")).toBe(
      "/transfer/qr/TOKEN123",
    );
  });

  it("falls back to /dashboard by default", () => {
    expect(resolveSafeNext("/vehicles/v1")).toBe("/dashboard");
    expect(resolveSafeNext(null)).toBe("/dashboard");
    expect(resolveSafeNext("//evil.example")).toBe("/dashboard");
  });

  it("honours a custom fallback", () => {
    expect(resolveSafeNext("nope", "/login")).toBe("/login");
  });
});
