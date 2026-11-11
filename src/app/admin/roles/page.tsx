"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PERMISSIONS,
  permissionsByGroup,
  type AccessLevel,
  type Permission,
  type PermissionGrant,
} from "@/lib/auth/permissions";
import { usePermissions } from "@/components/permissions-provider";

type Role = {
  id: number;
  name: string;
  is_system: boolean;
  description: string | null;
  user_count: number;
  permissions: PermissionGrant[];
};

type GrantChoice = AccessLevel | "none";

type RolesResponse = { actorRoleId: number | null; roles: Role[] };

async function fetchRoles(): Promise<RolesResponse> {
  const response = await fetch("/api/roles");
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar los roles");
  return data;
}

const sameGrants = (a: readonly PermissionGrant[], b: readonly PermissionGrant[]) => {
  if (a.length !== b.length) return false;
  return a.every((grant) =>
    b.some((other) => other.permission === grant.permission && other.access === grant.access)
  );
};

function choiceOf(grants: readonly PermissionGrant[], permission: Permission): GrantChoice {
  return grants.find((grant) => grant.permission === permission)?.access ?? "none";
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { can, loading: permsLoading } = usePermissions();
  const canWrite = !permsLoading && can("users.manage");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["roles-access"],
    queryFn: fetchRoles,
  });

  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);

  const selected = data?.roles.find((role) => role.id === selectedId) ?? null;
  const isNew = selectedId === "new";
  const groups = useMemo(() => permissionsByGroup(), []);

  const loadRole = (role: Role) => {
    setSelectedId(role.id);
    setName(role.name);
    setPermissions(role.is_system ? [] : [...role.permissions]);
  };

  const startNew = () => {
    setSelectedId("new");
    setName("");
    setPermissions([]);
  };

  const dirty = isNew
    ? name.trim().length > 0 || permissions.length > 0
    : selected != null &&
      (name.trim() !== selected.name ||
        (!selected.is_system && !sameGrants(permissions, selected.permissions)));

  const save = useMutation({
    mutationFn: async () => {
      const payload = selected?.is_system
        ? { name }
        : { name, permissions };
      const response = await fetch(isNew ? "/api/roles" : `/api/roles/${selectedId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo guardar el rol");
      return body as { id: number };
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["roles-access"] });
      queryClient.invalidateQueries({ queryKey: ["users-access"] });
      setSelectedId(saved.id);
      toast.success(isNew ? "Rol creado" : "Rol guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/roles/${id}`, { method: "DELETE" });
      if (response.status === 204) return;
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "No se pudo eliminar el rol");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-access"] });
      setSelectedId(null);
      toast.success("Rol eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setChoice = (permission: Permission, choice: GrantChoice) => {
    setPermissions((current) => {
      const rest = current.filter((grant) => grant.permission !== permission);
      if (choice === "none") return rest;
      return [...rest, { permission, access: choice }];
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {error instanceof Error ? error.message : "No se pudieron cargar los roles."}
      </p>
    );
  }

  const deleteBlocked = !selected || selected.is_system || selected.user_count > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Cada usuario tiene uno solo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.roles.map((role) => (
            <Button
              key={role.id}
              type="button"
              variant={selectedId === role.id ? "secondary" : "ghost"}
              className="justify-between"
              onClick={() => loadRole(role)}
            >
              <span>{role.name}</span>
              <span className="text-xs text-muted-foreground">{role.user_count}</span>
            </Button>
          ))}
          {canWrite ? (
            <Button type="button" variant={isNew ? "secondary" : "outline"} onClick={startNew}>
              Nuevo rol
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isNew ? "Nuevo rol" : selected ? selected.name : "Elegí un rol"}</CardTitle>
          <CardDescription>
            En cada sección se puede dar solo lectura o también escritura. La escritura incluye
            ver la sección. El rol Admin tiene siempre todos y no se puede borrar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedId == null ? (
            <p className="text-sm text-muted-foreground">Elegí un rol de la lista o creá uno nuevo.</p>
          ) : (
            <form
              className="flex flex-col gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="grid max-w-sm gap-2">
                <Label htmlFor="role-name">Nombre</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canWrite}
                  maxLength={60}
                  required
                />
              </div>

              {selected?.is_system ? (
                <p className="text-sm text-muted-foreground">
                  Este rol tiene acceso total, incluidos los permisos que se agreguen más adelante.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {groups.map((group) => (
                    <div key={group.group} className="space-y-2">
                      <div className="text-sm font-medium">{group.group}</div>
                      {group.permissions.map((permission) => {
                        const meta = PERMISSIONS[permission];
                        const choice = choiceOf(permissions, permission);
                        return (
                          <div key={permission} className="flex items-center justify-between gap-2">
                            <Label htmlFor={`perm-${permission}`} className="text-sm font-normal">
                              {meta.label}
                            </Label>
                            <select
                              id={`perm-${permission}`}
                              className="h-8 rounded-md border bg-background px-2 text-sm"
                              value={choice}
                              disabled={!canWrite}
                              onChange={(e) => setChoice(permission, e.target.value as GrantChoice)}
                            >
                              <option value="none">Sin acceso</option>
                              <option value="read">Lectura</option>
                              <option value="write">Escritura</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={!dirty || save.isPending || !name.trim()}>
                  {save.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isNew ? "Crear rol" : "Guardar cambios"}
                </Button>
                {!isNew ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteBlocked || remove.isPending}
                    title={
                      selected?.is_system
                        ? "El rol Admin no se puede eliminar"
                        : selected && selected.user_count > 0
                          ? "Hay usuarios con este rol"
                          : "Eliminar rol"
                    }
                    onClick={() => {
                      if (!selected) return;
                      if (!window.confirm(`¿Eliminar el rol "${selected.name}"?`)) return;
                      remove.mutate(selected.id);
                    }}
                  >
                    Eliminar
                  </Button>
                ) : null}
              </div>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
