/**
 * Definición de los tours de onboarding del taller (Fase 3).
 *
 * Cada paso apunta a un elemento con atributo `data-tour` estable. Los tours
 * se disparan bajo demanda (nunca auto-start en cada login) y son distintos
 * por rol de usuario en el taller:
 *
 * - owner / admin: completar datos → crear sucursal → cargar especialidades.
 * - recepcionista: registrar una atención.
 * - técnico: revisar verificaciones pendientes.
 *
 * Los targets se resuelven contra el DOM real del detalle del taller:
 *   workshop-cta-registrar   → CTA "Registrar servicio" (/atenciones/nueva)
 *   workshop-tab-especialidades → tab "Especialidades"
 *   workshop-overview-atenciones → tarjeta "Atenciones recientes"
 *   workshop-overview-checklist → checklist "Primeros pasos del taller"
 */

export type OnboardingRole = "owner" | "admin" | "recepcionista" | "tecnico";

export interface OnboardingTourStep {
  /** Id estable del paso (para analytics y persistencia). */
  id: string;
  /** Selector CSS del elemento a resaltar (debe tener el `data-tour` matching). */
  target: string;
  title: string;
  body: string;
  /** Antes de mostrar el paso: p. ej. cambiar de tab. */
  before?: () => void;
  /** Si el paso es opcional porque el target puede no existir en este rol. */
  optional?: boolean;
}

/** Pasos del tour para dueño/administrador del taller. */
export function ownerTourSteps(): OnboardingTourStep[] {
  return [
    {
      id: "especialidades-tab",
      target: '[data-tour="workshop-tab-especialidades"]',
      title: "Cargá las especialidades del taller",
      body: "Así tus clientes saben qué servicios ofrecés al hacer el check-in. Sin especialidades, el sistema avisa que faltan (no bloquea la operación).",
      before: () => {
        // El tab Especialidades está en la misma página; el tour se abre ya
        // posicionado en Resumen. El paso resalta la tab para invitar a abrirla.
      },
    },
    {
      id: "nueva-especialidad",
      target: '[data-tour="workshop-btn-nueva-especialidad"]',
      title: "Agregá tu primera especialidad",
      body: "Elegí una del catálogo y guardá. Podés sumar todas las que necesites; después se ven en el perfil público del taller.",
      optional: true,
    },
    {
      id: "registrar-atencion",
      target: '[data-tour="workshop-cta-registrar"]',
      title: "Registrá tu primera atención",
      body: "Buscá el vehículo por patente, completá el ingreso y listo. Necesitás al menos una sucursal activa.",
    },
  ];
}

/** Pasos del tour para recepcionista. */
export function recepcionistaTourSteps(): OnboardingTourStep[] {
  return [
    {
      id: "registrar-atencion",
      target: '[data-tour="workshop-cta-registrar"]',
      title: "Registrá una atención",
      body: "Buscá el vehículo por patente y completá el ingreso. Es el paso principal de tu día a día en el taller.",
    },
    {
      id: "verificaciones",
      target: '[data-tour="workshop-tab-verificaciones"]',
      title: "Revisá las verificaciones pendientes",
      body: "Los servicios del propietario que esperan tu verificación aparecen en la pestaña Verificaciones.",
      optional: true,
    },
  ];
}

/** Pasos del tour para técnico. */
export function tecnicoTourSteps(): OnboardingTourStep[] {
  return [
    {
      id: "verificaciones",
      target: '[data-tour="workshop-tab-verificaciones"]',
      title: "Cola de verificaciones",
      body: "Revisá y verificá los servicios que los propietarios cargaron. Cada verificación completa el historial clínico del vehículo.",
    },
  ];
}

/** Devuelve los pasos del tour según el rol de usuario en el taller. */
export function tourStepsForRole(role: OnboardingRole): OnboardingTourStep[] {
  switch (role) {
    case "owner":
    case "admin":
      return ownerTourSteps();
    case "recepcionista":
      return recepcionistaTourSteps();
    case "tecnico":
      return tecnicoTourSteps();
    default:
      return ownerTourSteps();
  }
}

/** Detecta el rol de usuario en el taller a partir de la sesión. */
export function workshopRoleFromSession(
  workshopId: string | null | undefined,
  user:
    | {
        workshopMemberships?: Array<{
          workshopId: string;
          role: { code: string };
        }>;
      }
    | null
    | undefined,
): OnboardingRole | null {
  if (!workshopId || !user?.workshopMemberships) return null;

  const membership = user.workshopMemberships.find(
    (m) => m.workshopId === workshopId,
  );
  if (!membership) return null;

  const code = membership.role.code.toLowerCase();
  if (code === "owner" || code === "admin") return "owner";
  if (code.includes("recepcionista") || code === "recepcionista")
    return "recepcionista";
  if (code.includes("tecnico") || code === "tecnico") return "tecnico";
  return "owner";
}
