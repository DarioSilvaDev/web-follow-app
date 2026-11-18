import { cn } from "cn";
import { Button } from "./button";
import { typeScale } from "./type-scale";

/**
 * PrimaryButton — acción principal de una pantalla (Design System Autentia).
 *
 * Único CTA primario por pantalla. 44px de alto (`h-11`) para cumplir el área
 * táctil mínima en mobile, texto 15px semibold y foco visible heredado de
 * `Button` (anillo del tema).
 *
 * `variant`/`size` se pueden pisar por props, pero el default es el primario:
 * si necesitás una acción secundaria usá `Button variant="outline"`.
 */
export type PrimaryButtonProps = React.ComponentProps<typeof Button>;

function PrimaryButton({ className, ...props }: PrimaryButtonProps) {
  return (
    <Button
      variant="default"
      className={cn(
        "h-11 gap-2 px-4 font-semibold",
        typeScale.body,
        className,
      )}
      {...props}
    />
  );
}

export { PrimaryButton };
