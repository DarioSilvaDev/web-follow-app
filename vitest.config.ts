import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/__test__/setup.ts"],
    css: false,
    // Plan 05 / C4: vitest no soporta TZ por suite → pin global + guarda de
    // entorno en los tests que dependen de la zona (UTC-3, como producción).
    // Sin el pin, el mismo test se ve verde en UTC y rojo en UTC-3.
    env: {
      TZ: "America/Argentina/Buenos_Aires",
    },
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
