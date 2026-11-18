"use client";

/**
 * Skeleton del detalle /vehicles/[id] mientras carga GET /:id.
 *
 * Reemplaza al spinner centrado: insinúa la forma final (hero + secciones)
 * para que el layout no salte cuando llegan los datos.
 */

export function VehicleDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando vehículo"
      className="flex flex-col gap-6"
    >
      {/* Hero (VehicleHeader) */}
      <div className="flex flex-col gap-3">
        <div className="h-8 w-36 animate-pulse rounded bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
        <div className="flex flex-wrap gap-2">
          <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-36 animate-pulse rounded bg-muted" />
        <div className="h-8 w-28 animate-pulse rounded bg-muted" />
      </div>

      {/* Secciones (ficha / fotos / documentos / kilometraje / historial) */}
      {[0, 1, 2].map((section) => (
        <div
          key={section}
          className="rounded-xl border bg-card p-4 shadow-sm"
          aria-hidden="true"
        >
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-5 w-44 animate-pulse rounded bg-muted" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
