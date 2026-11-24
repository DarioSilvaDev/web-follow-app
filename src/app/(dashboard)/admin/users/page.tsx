"use client";

/**
 * Listado admin de usuarios de plataforma — /admin/users.
 *
 * Fuente: GET /admin/users?page&limit&q&status&role&membership (permiso
 * admin.users.list). Búsqueda por q con debounce 300ms; filtro por estado
 * UserStatus y por rol de plataforma (admin|support); filtro NUEVO por
 * vínculo con el ecosistema (workshop|dealership|vehicle|none → 400 si
 * inválido).
 *
 * - Tabla DENSA (reemplaza las tarjetas expandibles): Usuario (link al
 *   detalle) / Estado / Roles / Talleres / Concesionarias / Vehículos.
 *   Los contadores de vínculos los computa el backend (aditivo).
 * - Orden: pendientes primero (server-side, espejo de workshops/dealerships);
 *   NO se ofrece sort client-side que lo contradiga.
 * - Badge de estado SOLO por status de cuenta (P6).
 * - q de 1 char lo rechaza el server con 400: el frontend solo dispara la
 *   búsqueda con ≥2 chars.
 *
 * Query key: ["admin-users", page, status, role, membership, q].
 */
import { useState } from "react";
import Link from "next/link";
import { Plus, Search, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import { adminApi } from "@/lib/api";
import { resolveAdminUsersListError } from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";
import { cn } from "cn";
import type {
  AdminUserMembershipFilter,
  AdminUserPlatformRoleFilter,
  AdminUserStatus,
} from "@/types/admin";

const PAGE_SIZE = 10;

type StatusFilter = "all" | AdminUserStatus;
type RoleFilter = "all" | AdminUserPlatformRoleFilter;
type MembershipFilter = "all" | AdminUserMembershipFilter;

function renderStatusBadge(status: string) {
  if (status === "suspended") {
    return <Badge variant="destructive">Suspendido</Badge>;
  }
  if (status === "pending") {
    return <Badge variant="warning">Pendiente</Badge>;
  }
  return <Badge variant="success">Activo</Badge>;
}

/** Contador de vínculos: "—" cuando es 0 (menos ruido visual). */
function CountCell({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        value === 0 ? "text-muted-foreground" : "font-medium text-foreground",
      )}
    >
      {value === 0 ? "—" : value}
    </span>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [membershipFilter, setMembershipFilter] =
    useState<MembershipFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const effectiveQuery =
    debouncedSearch.trim().length >= 2 ? debouncedSearch.trim() : undefined;

  const usersQuery = useQuery({
    queryKey: [
      "admin-users",
      page,
      statusFilter,
      roleFilter,
      membershipFilter,
      effectiveQuery,
    ],
    queryFn: () =>
      adminApi.listUsers({
        page,
        limit: PAGE_SIZE,
        q: effectiveQuery,
        status: statusFilter === "all" ? undefined : statusFilter,
        role: roleFilter === "all" ? undefined : roleFilter,
        membership:
          membershipFilter === "all" ? undefined : membershipFilter,
      }),
    retry: false,
  });

  // Gate defensivo por permiso de sección (UX; backend es la authority).
  if (!can(user, "admin.users.list")) {
    return <AdminNoAccessState />;
  }

  const items = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;

  const resetPage = () => setPage(1);

  const isFiltered =
    statusFilter !== "all" ||
    roleFilter !== "all" ||
    membershipFilter !== "all" ||
    Boolean(effectiveQuery);
  const isEmpty = meta?.total === 0 && !isFiltered;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná los usuarios de la plataforma, sus vínculos, roles y su
            estado.
          </p>
        </div>
        <Link
          href="/admin/users/nueva"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Plus className="h-3.5 w-3.5" />
          Invitar usuario
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-52 flex-1 flex-col gap-1 sm:max-w-xs">
          <label
            htmlFor="admin-users-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Buscar
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-users-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Nombre o email (mín. 2 caracteres)"
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="admin-users-status-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Estado
          </label>
          <Select
            id="admin-users-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              resetPage();
            }}
            className="w-40"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="admin-users-role-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Rol
          </label>
          <Select
            id="admin-users-role-filter"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as RoleFilter);
              resetPage();
            }}
            className="w-36"
          >
            <option value="all">Todos</option>
            <option value="admin">Admin</option>
            <option value="support">Soporte</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="admin-users-membership-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Vínculo
          </label>
          <Select
            id="admin-users-membership-filter"
            value={membershipFilter}
            onChange={(e) => {
              setMembershipFilter(e.target.value as MembershipFilter);
              resetPage();
            }}
            className="w-44"
          >
            <option value="all">Todos</option>
            <option value="workshop">Taller</option>
            <option value="dealership">Concesionaria</option>
            <option value="vehicle">Con vehículos</option>
            <option value="none">Sin vínculos</option>
          </Select>
        </div>
        <p className="pb-1 text-xs text-muted-foreground">
          Orden: pendientes primero (server-side)
        </p>
      </div>

      {usersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              No se pudieron cargar los datos
            </CardTitle>
            <CardDescription>{resolveAdminUsersListError()}</CardDescription>
          </CardHeader>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="No hay usuarios para mostrar"
            description={
              isEmpty
                ? "Todavía no hay usuarios en la plataforma. Invitá al primer administrador para empezar a gestionar."
                : "Ningún usuario coincide con la búsqueda o los filtros actuales."
            }
            action={
              <Link
                href="/admin/users/nueva"
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <Plus className="h-3.5 w-3.5" />
                Invitar usuario
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div
            aria-busy={usersQuery.isFetching}
            className="overflow-x-auto rounded-xl border bg-card shadow-sm"
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Usuarios de la plataforma con sus vínculos
              </caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Usuario
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Roles
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center font-medium">
                    Talleres
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center font-medium">
                    Concesionarias
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center font-medium">
                    Vehículos
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((userItem) => {
                  const displayName =
                    [userItem.firstName, userItem.lastName]
                      .filter(Boolean)
                      .join(" ") || userItem.email;
                  return (
                    <tr
                      key={userItem.id}
                      className="border-b border-border align-middle last:border-b-0"
                    >
                      <td className="max-w-72 px-4 py-2">
                        <Link
                          href={`/admin/users/${userItem.id}`}
                          className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {displayName}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          {userItem.email}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {renderStatusBadge(userItem.status)}
                      </td>
                      <td className="max-w-56 px-3 py-2">
                        {userItem.roles.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {userItem.roles.map((role) => (
                              <Badge
                                key={role.id}
                                variant="secondary"
                                className="whitespace-nowrap"
                              >
                                {role.name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <CountCell value={userItem.workshopCount} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <CountCell value={userItem.dealershipCount} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <CountCell value={userItem.vehicleCount} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <AdminTablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              isFetching={usersQuery.isFetching}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}
