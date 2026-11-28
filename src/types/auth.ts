export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  alias: string | null;
  avatarUrl: string | null;
  language: string;
  status: string;
  isVehicleOwner: boolean;
  /**
   * `hasSeenOnboarding` viene del backend (GET /auth/me) y persiste en BD.
   * Opcional por compatibilidad con sesiones cacheadas viejas y tests; el
   * dashboard usa `user.hasSeenOnboarding ?? false`.
   */
  hasSeenOnboarding?: boolean;
  hasSeenBranchTour?: boolean;
  hasSeenProfileTour?: boolean;
  hasSeenSpecialtyTour?: boolean;
  hasSeenCareEpisodeTour?: boolean;
  /**
   * Celular E.164 (+54…) o null si no hay. `phoneAreaCode`/`phoneNationalNumber`
   * son los campos de display ('' = no informado); ausentes en sesiones
   * cacheadas viejas — tolerar con optional chaining (nunca parsear E.164).
   * Legacy: `phone` puede venir crudo sin split (usuario viejo).
   */
  phone: string | null;
  phoneAreaCode?: string | null;
  phoneNationalNumber?: string | null;
  roles: Array<{ id: string; type: string; name: string; permissions?: string[] }>;
  workshopMemberships: Array<{
    workshopId: string;
    workshop: { id: string; name: string };
    role: {
      id: string;
      code: string;
      name: string;
      /**
       * Códigos de permiso del rol del taller (GET /auth/me). Opcional por
       * compatibilidad: sesiones cacheadas de antes del cambio no lo traen y
       * los gates caen al fallback (sin permiso).
       */
      permissions?: string[];
    };
  }>;
  /**
   * Milestone consignación (D-102 / resolución PM §3.4): membresías en
   * concesionarias → bootstrap del contexto activo DEALERSHIP.
   * OPCIONAL (aditivo): el backend actual aún no lo expone; la UI tolera su
   * ausencia sin romper el bootstrap de sesión.
   */
  dealershipMemberships?: Array<{
    dealershipId: string;
    dealershipName: string;
    logoUrl?: string | null;
    /** Contrato real de GET /auth/me (§28 §3.4): objeto de rol, espejo de workshopMemberships. */
    role: { id: string; code: string; name: string };
  }>;
  /**
   * Impersonación (D-016): presentes SOLO cuando la sesión es una
   * impersonación (super_admin navegando como otro usuario). Ausentes en
   * sesiones normales.
   */
  impersonated?: boolean;
  impersonatedBy?: string;
}

export interface AuthErrorEnvelope {
  statusCode: number;
  message: string;
  code: string;
  errors?: Record<string, string>;
}
