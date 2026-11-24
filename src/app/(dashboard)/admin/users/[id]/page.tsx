"use client";

/**
 * Detalle admin de usuario de plataforma — /admin/users/[id] (perfil 360).
 *
 * Fuente: GET /admin/users/:id (UserDetailAdminResponseDto + secciones
 * aditivas: workshopMemberships / dealershipMemberships / vehicles /
 * vehicleAccesses, solo vigentes) + GET /admin/roles (SystemRoleResponseDto[]
 * — resuelve roleType → roleId; assign/revoke usan UUID, NUNCA roleType).
 *
 * Header: avatar con iniciales, nombre, email, badges (estado + último
 * acceso), acciones Impersonar (confirmación con advertencia) y
 * Suspender/Reactivar. Zona de peligro al pie: Eliminar con confirmación
 * tipada (el email debe coincidir).
 *
 * Tabs (Base UI):
 * - Resumen: identidad/contacto (teléfono, alta, último acceso, email
 *   verificado, idioma) + roles de plataforma (asignar/revocar, reuso de la
 *   lógica existente).
 * - Talleres: membresías (link a /admin/workshops/[id], sucursal, rol, desde,
 *   badge de estado) + "Asignar a taller" (modal: buscador ?q=, select de
 *   rol de /admin/workshops/:id/roles, alta directa con email precargado).
 * - Concesionarias: ídem con /admin/dealerships/... — permiso
 *   `admin.dealerships.members` pendiente de seed → 403 con mensaje
 *   accionable (o aviso inline si la sesión no lo tiene).
 * - Vehículos: tenencias vigentes ("Propios") + accesos vigentes ("Con
 *   acceso"). Solo lectura; no hay ruta admin de detalle de vehículo.
 *
 * Protecciones UX (el enforcement real es del backend):
 * - El propio usuario logueado NO puede suspenderse ni quitarse roles.
 * - El rol super_admin NO puede quitarse desde la UI.
 * - Eliminar: prohibido en la UI sobre la propia cuenta (el backend también
 *   lo bloquea con 400).
 *
 * "Reenviar invitación" NO existe como endpoint de 1-click para usuarios de
 * plataforma (el POST /admin/users es el alta; reenviar no tiene ruta propia).
 * Se omite a propósito.
 *
 * Estados de error (patrón RF-6): 404 → "Usuario no encontrado"; 403 →
 * "Acceso denegado"; genérico → reintentar.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { EntityNotFoundState } from "@/components/admin/entity-not-found-state";
import { UserDealershipsSection } from "@/components/admin/user-dealerships-section";
import { UserVehiclesSection } from "@/components/admin/user-vehicles-section";
import { UserWorkshopsSection } from "@/components/admin/user-workshops-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { adminApi, isHTTPError } from "@/lib/api";
import { can } from "@/lib/admin-access";
import { formatAdminDate } from "@/lib/admin-status";
import {
  resolveAdminUserDetailError,
  resolveAssignUserRoleError,
  resolveDeleteUserError,
  resolveImpersonateUserError,
  resolveListAdminRolesError,
  resolveRevokeUserRoleError,
  resolveUpdateUserStatusError,
} from "@/lib/admin-errors";

const BANNER_DURATION_MS = 4000;

type Banner = { tone: "success" | "error"; text: string } | null;

function errorStatus(error: unknown): number | undefined {
  return isHTTPError(error)
    ? error.response.status
    : (error as { status?: number })?.status;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;
  const { user: sessionUser } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<Banner>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [tab, setTab] = useState("resumen");
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Banner transitorio inline (sin toast, patrón paneles del repo).
  const showBanner = (tone: NonNullable<Banner>["tone"], text: string) => {
    setBanner({ tone, text });
    window.setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  };

  const userQuery = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => adminApi.getUser(userId ?? ""),
    enabled: Boolean(userId),
    retry: false,
  });

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => adminApi.listRoles(),
    enabled: Boolean(userId),
    retry: false,
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      adminApi.updateUserStatus(userId ?? "", { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showBanner("success", "Estado del usuario actualizado.");
    },
    onError: (error) => {
      showBanner("error", resolveUpdateUserStatusError(error));
    },
  });

  const assignMutation = useMutation({
    mutationFn: (roleId: string) =>
      adminApi.assignUserRole({ userId: userId ?? "", roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelectedRoleId("");
      showBanner("success", "Rol asignado al usuario.");
    },
    onError: (error) => {
      showBanner("error", resolveAssignUserRoleError(error));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (roleId: string) =>
      adminApi.revokeUserRole({ userId: userId ?? "", roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showBanner("success", "Rol quitado al usuario.");
    },
    onError: (error) => {
      showBanner("error", resolveRevokeUserRoleError(error));
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: () => adminApi.impersonateUser(userId ?? ""),
    onSuccess: () => {
      setImpersonateOpen(false);
      // Recarga COMPLETA a propósito: la cookie access_token ya apunta al
      // usuario impersonado; la app debe re-bootstrapear como él (admin gate
      // incluido). No usar router.push.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    },
    onError: (error) => {
      setImpersonateError(resolveImpersonateUserError(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteUser(userId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      router.push("/admin/users");
    },
    onError: (error) => {
      setDeleteError(resolveDeleteUserError(error));
    },
  });

  // Loading: ficha aún no disponible.
  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Errores de carga (patrón RF-6).
  if (userQuery.isError || !userQuery.data) {
    const status = errorStatus(userQuery.error);
    if (status === 404) {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <EntityNotFoundState
            title="Usuario no encontrado"
            description="El usuario que buscás no existe o fue eliminado."
            backHref="/admin/users"
            backLabel="Volver a usuarios"
          />
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardContent className="py-8 text-center">
            {status === 403 ? (
              <>
                <p className="text-lg font-semibold">Acceso denegado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No tenés permiso para ver este usuario.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar el usuario
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolveAdminUserDetailError()}
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/admin/users">
                <Button variant="outline">Volver a usuarios</Button>
              </Link>
              {status !== 403 && (
                <Button onClick={() => userQuery.refetch()}>Reintentar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const detailUser = userQuery.data;
  const isSelf = sessionUser?.id === detailUser.id;
  const displayName =
    [detailUser.firstName, detailUser.lastName].filter(Boolean).join(" ") ||
    detailUser.email;
  const initials =
    [detailUser.firstName?.[0], detailUser.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || detailUser.email[0]?.toUpperCase() || "?";

  // Permisos (UX; backend es la autoridad).
  const canManage = can(sessionUser, "admin.users.manage");
  const canDelete = can(sessionUser, "admin.users.delete");
  const canAssignRole = can(sessionUser, "admin.roles.assign");
  const canRevokeRole = can(sessionUser, "admin.roles.revoke");

  // Roles asignables desde la UI: Admin | Soporte (nunca super_admin ni el
  // rol usuario final), y nunca los que el usuario ya tiene.
  const assignableRoles = (rolesQuery.data ?? []).filter(
    (role) =>
      role.type !== "super_admin" &&
      role.type !== "user" &&
      !detailUser.roles.some((assigned) => assigned.id === role.id),
  );

  const breadcrumbItems = [
    { label: "Administración", href: "/admin" },
    { label: "Usuarios", href: "/admin/users" },
    { label: displayName },
  ];

  const isSuspended = detailUser.status === "suspended";
  const isPending = detailUser.status === "pending";
  const isBusy =
    statusMutation.isPending ||
    assignMutation.isPending ||
    revokeMutation.isPending;

  const renderStatusBadge = () => {
    if (isSuspended) return <Badge variant="destructive">Suspendido</Badge>;
    if (isPending) return <Badge variant="warning">Pendiente</Badge>;
    return <Badge variant="success">Activo</Badge>;
  };

  const lastAccessLabel = detailUser.lastLoginAt
    ? new Date(detailUser.lastLoginAt).toLocaleString("es-AR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Nunca";

  const isDeleteConfirmed =
    deleteConfirm.trim().toLowerCase() === detailUser.email.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      <AdminBreadcrumb items={breadcrumbItems} />

      {banner && (
        <Callout
          variant={banner.tone === "success" ? "success" : "destructive"}
          role={banner.tone === "success" ? "status" : "alert"}
          className="w-full"
        >
          {banner.text}
        </Callout>
      )}

      {/* Header: identidad + acciones */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                <span className="truncate">{displayName}</span>
                {renderStatusBadge()}
              </CardTitle>
              <CardDescription className="mt-1 truncate">
                {detailUser.email}
              </CardDescription>
              <p className="mt-1 text-xs text-muted-foreground">
                Alta {formatAdminDate(detailUser.createdAt)} · Último acceso{" "}
                {lastAccessLabel}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Impersonar: reemplaza la sesión del admin por la del
                  usuario objetivo (cookie httpOnly, 1h). */}
              {canManage && !isSelf && (
                <Dialog
                  open={impersonateOpen}
                  onOpenChange={(next) => {
                    setImpersonateOpen(next);
                    if (next) setImpersonateError(null);
                  }}
                >
                  <DialogTrigger
                    render={<Button variant="outline" size="sm" />}
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    Impersonar
                  </DialogTrigger>
                  <DialogPopup>
                    <DialogTitle className="flex items-center gap-2">
                      <TriangleAlert
                        className="h-5 w-5 text-warning"
                        aria-hidden="true"
                      />
                      ¿Navegar como {displayName}?
                    </DialogTitle>
                    <DialogDescription>
                      Vas a navegar como ese usuario: las próximas acciones
                      quedan a su nombre hasta que cierres la sesión o pase 1
                      hora. Tu sesión de administrador queda suspendida en este
                      navegador. Solo impersoná a usuarios activos.
                    </DialogDescription>
                    {impersonateError && (
                      <Callout variant="destructive" role="alert" className="mt-3">
                        {impersonateError}
                      </Callout>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                      <DialogClose render={<Button variant="outline" />}>
                        Cancelar
                      </DialogClose>
                      <Button
                        variant="default"
                        disabled={
                          impersonateMutation.isPending ||
                          detailUser.status !== "active"
                        }
                        title={
                          detailUser.status !== "active"
                            ? "Solo usuarios activos pueden ser impersonados"
                            : undefined
                        }
                        onClick={() => impersonateMutation.mutate()}
                      >
                        {impersonateMutation.isPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Navegar como {detailUser.firstName || "el usuario"}
                      </Button>
                    </div>
                  </DialogPopup>
                </Dialog>
              )}

              {canManage && !isSelf && (
                <Dialog>
                  <DialogTrigger
                    render={
                      <Button variant="outline" size="sm" disabled={isBusy} />
                    }
                  >
                    {statusMutation.isPending && (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {isSuspended ? "Reactivar" : "Suspender"}
                  </DialogTrigger>
                  <DialogPopup>
                    <DialogTitle>
                      {isSuspended
                        ? `¿Reactivar a ${displayName}?`
                        : `¿Suspender a ${displayName}?`}
                    </DialogTitle>
                    <DialogDescription>
                      {isSuspended
                        ? "El usuario volverá a poder iniciar sesión con su cuenta."
                        : "El usuario no podrá iniciar sesión hasta que lo reactives. Sus vehículos y su historial se conservan."}
                    </DialogDescription>
                    <div className="mt-4 flex justify-end gap-2">
                      <DialogClose render={<Button variant="outline" />}>
                        Cancelar
                      </DialogClose>
                      <DialogClose
                        render={
                          <Button
                            variant={isSuspended ? "default" : "destructive"}
                            onClick={() =>
                              statusMutation.mutate(
                                isSuspended ? "active" : "suspended",
                              )
                            }
                          />
                        }
                      >
                        {isSuspended
                          ? "Reactivar usuario"
                          : "Suspender usuario"}
                      </DialogClose>
                    </div>
                  </DialogPopup>
                </Dialog>
              )}
            </div>
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                No podés modificar tu propia cuenta desde este panel.
              </p>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Tabs del perfil 360 */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="talleres">
            Talleres ({detailUser.workshopMemberships.length})
          </TabsTrigger>
          <TabsTrigger value="concesionarias">
            Concesionarias ({detailUser.dealershipMemberships.length})
          </TabsTrigger>
          <TabsTrigger value="vehiculos">
            Vehículos (
            {detailUser.vehicles.length + detailUser.vehicleAccesses.length})
          </TabsTrigger>
        </TabsList>

        {/* Resumen */}
        <TabsContent value="resumen" className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-5">
            {/* Identidad / contacto */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Identidad y contacto</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Email
                  </span>
                  <p className="break-all text-sm font-medium text-foreground">
                    {detailUser.email}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Teléfono
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {detailUser.phone ?? "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Alta
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {formatAdminDate(detailUser.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Último acceso
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {lastAccessLabel}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Email verificado
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {detailUser.emailVerifiedAt
                      ? formatAdminDate(detailUser.emailVerifiedAt)
                      : "No verificado"}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Idioma
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {detailUser.language}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Roles de plataforma */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Roles de plataforma</CardTitle>
                <CardDescription>
                  Asigná o quitá roles de administración y soporte. El rol
                  super_admin no se gestiona desde este panel.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {rolesQuery.isError && (
                  <Callout variant="destructive" role="alert">
                    {resolveListAdminRolesError()}
                  </Callout>
                )}

                {detailUser.roles.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {detailUser.roles.map((role) => {
                      const isSuperAdmin = role.type === "super_admin";
                      const canRevoke =
                        !isSelf && !isSuperAdmin && canRevokeRole;
                      return (
                        <li
                          key={role.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">
                              {role.name}
                            </span>
                            {isSuperAdmin && (
                              <Badge variant="info">Super admin</Badge>
                            )}
                          </div>
                          {canRevoke ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={revokeMutation.isPending}
                              onClick={() => revokeMutation.mutate(role.id)}
                            >
                              {revokeMutation.isPending &&
                              revokeMutation.variables === role.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                              Quitar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {isSuperAdmin
                                ? "No se puede quitar"
                                : isSelf
                                  ? "Tu propio rol"
                                  : "Sin permiso"}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {assignableRoles.length > 0 && !isSelf && canAssignRole && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-44 flex-1 flex-col gap-1 sm:max-w-xs">
                      <label
                        htmlFor="assign-role-select"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Asignar rol
                      </label>
                      <Select
                        id="assign-role-select"
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(e.target.value)}
                      >
                        <option value="" disabled>
                          Elegí un rol…
                        </option>
                        {assignableRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedRoleId || assignMutation.isPending}
                      onClick={() =>
                        selectedRoleId && assignMutation.mutate(selectedRoleId)
                      }
                    >
                      {assignMutation.isPending && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Asignar rol
                    </Button>
                  </div>
                )}

                {isSelf && (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <UserRound className="h-4 w-4 shrink-0 text-primary" />
                    Este es tu propio usuario: no podés quitarte roles desde
                    este panel.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Talleres */}
        <TabsContent value="talleres">
          <UserWorkshopsSection
            memberships={detailUser.workshopMemberships}
            inactiveMemberships={detailUser.inactiveWorkshopMemberships ?? []}
            userId={detailUser.id}
            userEmail={detailUser.email}
            displayName={displayName}
          />
        </TabsContent>

        {/* Concesionarias */}
        <TabsContent value="concesionarias">
          <UserDealershipsSection
            memberships={detailUser.dealershipMemberships}
            inactiveMemberships={detailUser.inactiveDealershipMemberships ?? []}
            userId={detailUser.id}
            userEmail={detailUser.email}
            displayName={displayName}
          />
        </TabsContent>

        {/* Vehículos */}
        <TabsContent value="vehiculos">
          <UserVehiclesSection
            vehicles={detailUser.vehicles}
            vehicleAccesses={detailUser.vehicleAccesses}
          />
        </TabsContent>
      </Tabs>

      {/* Zona de peligro: eliminar */}
      {canDelete && !isSelf && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              Zona de peligro
            </CardTitle>
            <CardDescription>
              Eliminar la cuenta de {displayName}. La baja es lógica: sus
              vehículos e historial se conservan, pero no podrá iniciar
              sesión ni aparecer en el ecosistema. Esta acción no se puede
              deshacer desde este panel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog
              open={deleteOpen}
              onOpenChange={(next) => {
                setDeleteOpen(next);
                if (next) {
                  setDeleteConfirm("");
                  setDeleteError(null);
                }
              }}
            >
              <DialogTrigger
                render={<Button variant="destructive" size="sm" />}
              >
                Eliminar usuario
              </DialogTrigger>
              <DialogPopup>
                <DialogTitle>¿Eliminar a {displayName}?</DialogTitle>
                <DialogDescription>
                  Para confirmar, escribí el email del usuario:{" "}
                  <span className="font-medium text-foreground">
                    {detailUser.email}
                  </span>
                </DialogDescription>
                {deleteError && (
                  <Callout variant="destructive" role="alert" className="mt-3">
                    {deleteError}
                  </Callout>
                )}
                <div className="mt-4 flex flex-col gap-1.5">
                  <Label htmlFor="delete-confirm-email">
                    Email del usuario
                  </Label>
                  <Input
                    id="delete-confirm-email"
                    type="email"
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder={detailUser.email}
                    autoComplete="off"
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose render={<Button variant="outline" />}>
                    Cancelar
                  </DialogClose>
                  <Button
                    variant="destructive"
                    disabled={!isDeleteConfirmed || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Eliminar definitivamente
                  </Button>
                </div>
              </DialogPopup>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
