/**
 * Color de un vehículo como hex — catálogo de nombres comunes en español.
 *
 * El backend guarda el color como texto libre (catálogo/registro de la app),
 * por lo que los nombres llegan en español ("Rojo", "Azul marino", "Plateado").
 * Como CSS no entiende "rojo", los indicadores tipo "dot" se veían vacíos.
 *
 * `normalize` es accents/case-insensitive para tolerar "Marron"/"Marrón"/"MARRON".
 * Sin match conocido se devuelve `undefined` y el llamador decide el fallback
 * (renderizar el círculo sin relleno, nunca un color inventado).
 */

const SPANISH_COLOR_HEX: Record<string, string> = {
  blanco: "#f5f5f5",
  "blanco perla": "#f8f8f0",
  negro: "#1a1a1a",
  rojo: "#d32f2f",
  azul: "#1e5aa8",
  "azul marino": "#163a5f",
  "azul oscuro": "#163a5f",
  celeste: "#87ceeb",
  turquesa: "#40e0d0",
  aqua: "#00ffff",
  verde: "#228b22",
  "verde oscuro": "#145214",
  oliva: "#808000",
  amarillo: "#ffd400",
  naranja: "#e07700",
  marron: "#6f4e37",
  beige: "#d8c3a5",
  dorado: "#d4af37",
  plateado: "#c0c0c0",
  plata: "#c0c0c0",
  gris: "#6b7280",
  "gris oscuro": "#374151",
  "gris claro": "#d1d5db",
  bordo: "#6f1d2f",
  violeta: "#7c3aed",
  morado: "#6b21a8",
  rosa: "#ec4899",
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas combinables (U+0300–U+036F)
    .replace(/\s+/g, " ");
}

/**
 * Hex del color declarado por nombre (es), o `undefined` si no se reconoce.
 * Nunca aproxima: un valor desconocido queda sin relleno antes que mostrarse
 * con un color equivocado.
 */
export function vehicleColorHex(color?: string | null): string | undefined {
  if (!color) return undefined;
  return SPANISH_COLOR_HEX[normalize(color)];
}
