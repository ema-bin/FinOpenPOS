"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { generateTemporaryPassword } from "@/lib/auth/create-user-input";

type Role = {
  id: number;
  name: string;
  is_system: boolean;
  description: string | null;
  permissions: Permission[];
};

type AccessUser = {
  id: string;
  email: string;
  name: string;
  role_id: number | null;
};

type AccessResponse = {
  currentUserId: string;
  users: AccessUser[];
  roles: Role[];
};

async function fetchAccess(): Promise<AccessResponse> {
  const response = await fetch("/api/users");
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar los usuarios");
  return data;
}

function roleSummary(role: Role): string {
  if (role.is_system) return "Acceso total";
  if (role.permissions.length === 0) return "Sin permisos";
  return role.permissions.map((permission) => PERMISSIONS[permission].label).join(" · ");
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const [resetUser, setResetUser] = useState<AccessUser | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users-access"],
    queryFn: fetchAccess,
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: number }) => {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo cambiar el rol");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-access"] });
      toast.success("Rol actualizado. Lo ve cuando vuelve a iniciar sesión.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createUser = useMutation({
    mutationFn: async (roleId: number) => {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, roleId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo crear el usuario");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-access"] });
      setEmail("");
      setName("");
      setPassword("");
      toast.success("Usuario creado. Ya puede iniciar sesión con esa contraseña.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const response = await fetch(`/api/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo cambiar la contraseña");
    },
    onSuccess: () => {
      setResetUser(null);
      toast.success("Contraseña actualizada. La anterior ya no sirve.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openReset = (user: AccessUser) => {
    setTempPassword(generateTemporaryPassword());
    setResetUser(user);
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
        {error instanceof Error ? error.message : "No se pudo cargar los usuarios."}
      </p>
    );
  }

  const roleById = new Map(data.roles.map((role) => [role.id, role]));
  const selectedNewRole =
    newRoleId ||
    String((data.roles.find((role) => !role.is_system) ?? data.roles[0])?.id ?? "");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
          <CardDescription>
            Queda habilitado para entrar enseguida, con el email y la contraseña que cargues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createUser.mutate(Number(selectedNewRole));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-user-name">Nombre</Label>
              <Input
                id="new-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-user-password">Contraseña</Label>
              <Input
                id="new-user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <Label>Rol</Label>
              <Select value={selectedNewRole} onValueChange={setNewRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un rol" />
                </SelectTrigger>
                <SelectContent>
                  {data.roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={createUser.isPending || !selectedNewRole}>
                {createUser.isPending ? (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Crear usuario
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
          <CardDescription>
            Cada usuario tiene un rol, y el rol define a qué secciones entra. El cambio aplica
            cuando esa persona vuelve a iniciar sesión.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead className="w-[240px]">Rol</TableHead>
                <TableHead className="w-[180px] text-right">Contraseña</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => {
                const isSelf = user.id === data.currentUserId;
                const pending =
                  setRole.isPending && setRole.variables?.userId === user.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.email || "Sin email"}</div>
                      <div className="text-xs text-muted-foreground">
                        {[user.name, isSelf ? "Vos" : ""].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role_id != null ? String(user.role_id) : undefined}
                        onValueChange={(value) =>
                          setRole.mutate({ userId: user.id, roleId: Number(value) })
                        }
                        disabled={pending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.roles.map((role) => (
                            <SelectItem key={role.id} value={String(role.id)}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openReset(user)}
                      >
                        Blanquear
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    No hay usuarios.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué puede hacer cada rol</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.roles.map((role) => (
            <div key={role.id}>
              <div className="text-sm font-medium">{role.name}</div>
              <p className="text-xs text-muted-foreground">{roleSummary(roleById.get(role.id)!)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={resetUser != null} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contraseña temporal</DialogTitle>
            <DialogDescription>
              Reemplaza la contraseña de {resetUser?.email}. Pasásela para que pueda entrar. La
              anterior deja de servir.
              {resetUser?.id === data.currentUserId
                ? " Es tu usuario: vas a tener que iniciar sesión de nuevo."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(tempPassword);
                toast.success("Contraseña copiada");
              }}
            >
              <CopyIcon className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetUser(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={resetPassword.isPending || tempPassword.length < 6}
              onClick={() => {
                if (!resetUser) return;
                resetPassword.mutate({ userId: resetUser.id, password: tempPassword });
              }}
            >
              {resetPassword.isPending ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
