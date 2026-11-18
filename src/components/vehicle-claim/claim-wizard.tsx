import { Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "cn";

/**
 * Stepper de 3 pasos + shell de Card del wizard de reclamo (F-1, copy §1.1).
 *
 * Patrón de `InvitationWizard`: el wizard es el Card (stepper en el header +
 * título/descripción de la pantalla actual) y los pasos son contenido puro.
 *
 * Pasos: 1 "Tu vehículo" · 2 "Tu cuenta" · 3 "Tu historial". Se muestra desde
 * la verificación en adelante (el bootstrap y la patente van sin stepper —
 * "sólo visible desde el paso 2", §1.1). El paso activo lleva
 * `aria-current="step"` (§5) y los completados muestran un check.
 * `aria-label` del contenedor literal del spec §1.1.
 */
export function ClaimWizard({
  currentStep,
  accountMode = "register",
  title,
  description,
  children,
}: {
  currentStep: 1 | 2 | 3;
  accountMode?: "register" | "login";
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const steps = [
    { n: 1 as const, label: "Tu vehículo", description: "Verificá los datos" },
    {
      n: 2 as const,
      label: "Tu cuenta",
      description: accountMode === "login" ? "Iniciá sesión" : "Creá tu cuenta",
    },
    {
      n: 3 as const,
      label: "Tu historial",
      description: "Reclamá el historial",
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <ol
          aria-label="Progreso del reclamo del vehículo"
          className="mb-2 flex flex-wrap items-center gap-2"
        >
          {steps.map((step) => {
            const isActive = step.n === currentStep;
            const isDone = step.n < currentStep;
            return (
              <li
                key={step.n}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-success bg-success/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {isDone ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">{step.n}</span>
                )}
                {step.label}
              </li>
            );
          })}
        </ol>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
