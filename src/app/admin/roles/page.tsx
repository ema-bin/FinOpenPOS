"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSIONS, permissionsByGroup, type Permission } from "@/lib/auth/permissions";

type Role = {
  id: number;
  name: string;
  is_system: boolean;
  description: string | null;
  user_count: number;
  permissions: Permission[];
};

type RolesResponse = { actorRoleId: number | null; roles: Role[] };

async function fetchRoles(): Promise<RolesResponse> {
  const response = await fetch("/api/roles");
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar los roles");
  return data;
}

const samePermissions = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((permission) => set.has(permission));
};

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["roles-access"],
    queryFn: fetchRoles,
  });

  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);

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
        (!selected.is_system && !samePermissions(permissions, selected.permissions)));

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

  const toggle = (permission: Permission, checked: boolean) => {
    setPermissions((current) =>
      checked ? [...current, permission] : current.filter((item) => item !== permission)
    );
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
          <Button type="button" variant={isNew ? "secondary" : "outline"} onClick={startNew}>
            Nuevo rol
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isNew ? "Nuevo rol" : selected ? selected.name : "Elegí un rol"}</CardTitle>
          <CardDescription>
            Los permisos se agrupan por sección. El rol Admin tiene siempre todos y no se puede
            borrar.
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
                      {group.permissions.map((permission) => (
                        <label
                          key={permission}
                          htmlFor={`perm-${permission}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            id={`perm-${permission}`}
                            checked={permissions.includes(permission)}
                            onCheckedChange={(checked) => toggle(permission, checked === true)}
                          />
                          {PERMISSIONS[permission].label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}

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
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
