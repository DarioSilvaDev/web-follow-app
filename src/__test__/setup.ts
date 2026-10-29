import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearActiveContext } from "@/lib/active-context";

// Auto-cleanup after each test.
afterEach(() => {
  cleanup();
  // D-021: el store persiste en sessionStorage (por-pestaña), así que sin este
  // reset el contexto de un caso podría filtrarse al siguiente dentro del
  // mismo archivo (sessionStorage no se limpia solo con `cleanup`).
  clearActiveContext();
});
