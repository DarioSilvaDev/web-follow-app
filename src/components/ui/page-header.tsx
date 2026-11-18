import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { typeScale } from "./type-scale";

/**
 * PageHeader — encabezado de pantalla (Design System Autentia).
 *
 * Agrupa navegación de retorno + identidad de la pantalla. No reemplaza al
 * header global del shell (`(dashboard)/layout.tsx`): acá vive solo lo que
 * pertenece al contexto de ESTA pantalla.
 *
 * Semántica: el contenedor es `<header>`, el título es el `h1` de la pantalla
 * (`PageTitle`) y la navegación de retorno es un link real (`BackLink`).
 */
export interface PageHeaderProps extends React.ComponentProps<"header"> {
  /** Slot de navegación, normalmente `<BackLink>`. */
  back?: React.ReactNode;
}

function PageHeader({ back, children, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)} {...props}>
      {back}
      {children}
    </header>
  );
}

/**
 * BackLink — retorno al contexto anterior.
 *
 * - `min-h-11` (44px) para cumplir el área táctil mínima en mobile.
 * - Foco visible con anillo del tema, nunca solo color al hover.
 */
export interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

function BackLink({ href, children, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "-ml-1 inline-flex w-fit min-h-11 items-center gap-1.5 rounded-control px-1 font-medium text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        typeScale.label,
        className,
      )}
    >
      <ArrowLeft className="size-[18px] shrink-0" aria-hidden="true" />
      {children}
    </Link>
  );
}

/**
 * PageTitle — título y subtítulo de la pantalla.
 *
 * Jerarquía: título 20px semibold, `meta` (13px, gris) para la identidad
 * secundaria (patente, marca/modelo, actor) y `actions` a la derecha para los
 * badges de estado. En mobile las acciones bajan debajo del título.
 */
export interface PageTitleProps {
  title: React.ReactNode;
  /** Línea secundaria bajo el título (identidad del vehículo, etc.). */
  meta?: React.ReactNode;
  /** Descripción adicional opcional (15px). */
  description?: React.ReactNode;
  /** Badges de estado / acciones alineadas a la derecha. */
  actions?: React.ReactNode;
  as?: "h1" | "h2";
  className?: string;
}

function PageTitle({
  title,
  meta,
  description,
  actions,
  as: Heading = "h1",
  className,
}: PageTitleProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <Heading
          className={cn(
            "font-heading font-semibold tracking-tight text-foreground",
            typeScale.display,
          )}
        >
          {title}
        </Heading>
        {meta ? (
          <div
            className={cn(
              "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground",
              typeScale.label,
            )}
          >
            {meta}
          </div>
        ) : null}
        {description ? (
          <p className={cn("mt-1 text-muted-foreground", typeScale.body)}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export { BackLink, PageHeader, PageTitle };
