/**
 * Escala tipográfica del Design System de Autentia.
 *
 * Los tamaños son tokens de `globals.css` (`--type-*`). Acá se exponen como
 * clases para que todos los componentes usen el mismo par tamaño/interlínea.
 *
 * ¿Por qué la forma arbitraria con prefijo `length:` y no `text-label`?
 * `cn()` (tailwind-merge) agrupa `text-<algo>` con los colores: al convivir con
 * `text-foreground` / `text-muted-foreground` descarta el tamaño. La forma
 * arbitraria con `length:` sí se reconoce como font-size y se mergea bien.
 *
 * Uso: `className={cn(typeScale.body, "font-medium text-foreground")}`.
 */
export const typeScale = {
  /** 20px — título de pantalla (h1 del detalle). */
  display: "text-[length:var(--type-display)] leading-[var(--type-display-line)]",
  /** 18px — título de tarjeta o sección. */
  title: "text-[length:var(--type-title)] leading-[var(--type-title-line)]",
  /** 15px — cuerpo de texto y valores de campo. */
  body: "text-[length:var(--type-body)] leading-[var(--type-body-line)]",
  /** 13px — texto secundario (link de vuelta, descripciones cortas). */
  label: "text-[length:var(--type-label)] leading-[var(--type-label-line)]",
  /** 12px — etiquetas de campo, contadores y captions. */
  meta: "text-[length:var(--type-meta)] leading-[var(--type-meta-line)]",
} as const;

export type TypeScale = keyof typeof typeScale;
