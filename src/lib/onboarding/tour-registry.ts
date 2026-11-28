/**
 * Registro de tours temáticos del taller (Fase 3).
 *
 * Cada tour tiene un `tourId` que se mapea a un flag en la BD
 * (`hasSeenBranchTour`, etc.) y un conjunto de pasos para Driver.js.
 *
 * Los pasos apuntan a elementos con atributo `data-tour` del DOM real.
 * Los pasos que pueden no existir en mobile se marcan como `optional: true`.
 *
 * Máximo 3-5 pasos por tour.
 */

export type TourId =
  | "onboarding"
  | "branch"
  | "profile"
  | "specialty"
  | "careEpisode";

export interface TourStep {
  id: string;
  target: string;
  title: string;
  body: string;
  before?: () => void;
  optional?: boolean;
}

export interface TourDefinition {
  id: TourId;
  label: string;
  description: string;
  steps: TourStep[];
}

/** Flag en BD correspondiente a cada tourId. */
export const TOUR_FLAG_MAP: Record<TourId, string> = {
  onboarding: "hasSeenOnboarding",
  branch: "hasSeenBranchTour",
  profile: "hasSeenProfileTour",
  specialty: "hasSeenSpecialtyTour",
  careEpisode: "hasSeenCareEpisodeTour",
};

/** Tours temáticos del taller. */
export const TOUR_REGISTRY: Record<TourId, TourDefinition> = {
  onboarding: {
    id: "onboarding",
    label: "Tour de bienvenida",
    description: "Conocé las funciones principales del dashboard.",
    steps: [
      {
        id: "dashboard-vehicle-selector",
        target: '[data-tour="dashboard-vehicle-selector"]',
        title: "Seleccioná tu vehículo activo",
        body:
          "El vehículo activo se muestra en el centro del dashboard. Elegí uno de la lista para ver su historia y trazabilidad.",
        optional: true,
      },
      {
        id: "dashboard-nueva-atencion",
        target: '[data-tour="dashboard-nueva-atencion"]',
        title: "Registrá tu primera atención",
        body:
          "Usá 'Nueva atención' para hacer el check-in de un vehículo por patente y crear su episodio de servicio.",
        optional: true,
      },
    ],
  },
  branch: {
    id: "branch",
    label: "Cargar sucursal",
    description: "Aprendé a cargar una sucursal para registrar atenciones.",
    steps: [
      {
        id: "branch-tab",
        target: '[data-tour="workshop-tab-sucursales"]',
        title: "Pestaña Sucursales",
        body:
          "Acá podés gestionar las sucursales de tu taller. Necesitás al menos una para registrar atenciones.",
        optional: true,
      },
      {
        id: "branch-new-btn",
        target: '[data-tour="workshop-btn-nueva-sucursal"]',
        title: "Agregar sucursal",
        body:
          "Clic acá para crear una nueva sucursal con nombre, dirección y contacto.",
        optional: true,
      },
      {
        id: "branch-form",
        target: '[data-tour="workshop-form-sucursal"]',
        title: "Completá los datos",
        body:
          "Ingresá el nombre de la sucursal (obligatorio) y los datos de contacto. La sede principal se marca con el check.",
        optional: true,
      },
    ],
  },
  profile: {
    id: "profile",
    label: "Completar perfil",
    description: "Completá los datos del taller para que tus clientes te encuentren.",
    steps: [
      {
        id: "profile-tab",
        target: '[data-tour="workshop-tab-datos"]',
        title: "Pestaña Datos",
        body:
          "Acá editás la información del taller: nombre, contacto, sitio web y descripción.",
        optional: true,
      },
      {
        id: "profile-website",
        target: '[data-tour="workshop-input-website"]',
        title: "Sitio web",
        body:
          "Agregá tu sitio web para que los clientes puedan conocerte mejor.",
        optional: true,
      },
      {
        id: "profile-description",
        target: '[data-tour="workshop-input-description"]',
        title: "Descripción",
        body:
          "Describe los servicios que ofrece tu taller. Esta información aparece en el perfil público.",
        optional: true,
      },
      {
        id: "profile-save",
        target: '[data-tour="workshop-btn-guardar-datos"]',
        title: "Guardar cambios",
        body:
          "No olvides guardar los cambios para que se persistan en el sistema.",
        optional: true,
      },
    ],
  },
  specialty: {
    id: "specialty",
    label: "Cargar especialidad",
    description: "Agregá las especialidades que ofrece tu taller.",
    steps: [
      {
        id: "specialty-tab",
        target: '[data-tour="workshop-tab-especialidades"]',
        title: "Pestaña Especialidades",
        body:
          "Acá cargás las especialidades de tu taller. Sin especialidades, el sistema avisa que faltan (no bloquea la operación).",
        optional: true,
      },
      {
        id: "specialty-new-btn",
        target: '[data-tour="workshop-btn-nueva-especialidad"]',
        title: "Agregar especialidad",
        body:
          "Elegí una especialidad del catálogo y guardá. Podés sumar todas las que necesites.",
        optional: true,
      },
      {
        id: "specialty-catalog",
        target: '[data-tour="workshop-select-especialidad"]',
        title: "Elegí del catálogo",
        body:
          "Seleccioná una especialidad del catálogo público. Las especialidades determinan qué tipos de atención podés registrar.",
        optional: true,
      },
    ],
  },
  careEpisode: {
    id: "careEpisode",
    label: "Registrar atención",
    description: "Aprendé a registrar una atención en tu taller.",
    steps: [
      {
        id: "care-episode-cta-workshop",
        target: '[data-tour="workshop-cta-registrar"]',
        title: "Registrar servicio",
        body:
          "Desde acá entrás al check-in. Buscá el vehículo por patente, elegí la sucursal y completá el ingreso para crear el episodio de servicio.",
        optional: true,
      },
      {
        id: "care-episode-cta-dashboard",
        target: '[data-tour="dashboard-nueva-atencion"]',
        title: "Nueva atención",
        body:
          "También podés registrar una atención desde el dashboard. El flujo es el mismo: patente → sucursal → datos del servicio.",
        optional: true,
      },
    ],
  },
};
