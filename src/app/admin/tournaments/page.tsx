"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { TournamentDTO, TournamentListItem } from "@/models/dto/tournament";
import type { TournamentStatus } from "@/models/db/tournament";
import type { Category } from "@/models/db/category";
import { tournamentsService } from "@/services";

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isPuntuable, setIsPuntuable] = useState(false);
  const [isSuma13Damas, setIsSuma13Damas] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories", "libre"],
    queryFn: async () => {
      const res = await fetch("/api/categories?type=libre");
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
  const { data: categoriesDamas = [] } = useQuery<Category[]>({
    queryKey: ["categories", "damas"],
    queryFn: async () => {
      const res = await fetch("/api/categories?type=damas");
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
  const suma13Category = categoriesDamas.find((c) => c.name === "Suma 13 damas");

  const [isCategorySpecific, setIsCategorySpecific] = useState(false);
  const [hasSuperTiebreak, setHasSuperTiebreak] = useState(false);
  const [matchDuration, setMatchDuration] = useState<number>(60);
  const [registrationFee, setRegistrationFee] = useState<number>(0);
  const [creating, setCreating] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [tournamentToEdit, setTournamentToEdit] = useState<TournamentDTO | null>(null);
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const [statusFilter, setStatusFilter] =
    useState<StatusFilterOption>("active");
  const [isFiltering, setIsFiltering] = useState(false);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    const isFirstLoad = !hasFetchedRef.current;
    const statuses = getStatusesForFilter(statusFilter);

    const fetchData = async () => {
      try {
        if (isFirstLoad) {
          setLoading(true);
        } else {
          setIsFiltering(true);
        }

        const data = await tournamentsService.getAll(statuses);
        if (!isActive) return;
        setTournaments(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!isActive) return;
        if (isFirstLoad) {
          setLoading(false);
        } else {
          setIsFiltering(false);
        }
        hasFetchedRef.current = true;
      }
    };

    fetchData();

    return () => {
      isActive = false;
    };
  }, [statusFilter]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      setCreating(true);
      const created = await tournamentsService.create({
        name,
        start_date: "",
        end_date: "",
        description: null,
        category_id: isSuma13Damas ? (suma13Category?.id ?? null) : (isCategorySpecific ? categoryId ?? null : null),
        is_category_specific: isCategorySpecific && !isSuma13Damas,
        is_suma_13_damas: isSuma13Damas,
        is_puntuable: isPuntuable,
        has_super_tiebreak: hasSuperTiebreak,
        match_duration: matchDuration,
        registration_fee: registrationFee,
      });
      setDialogOpen(false);
      setName("");
      setCategoryId(null);
      setIsPuntuable(false);
      setIsCategorySpecific(false);
      setIsSuma13Damas(false);
      setHasSuperTiebreak(false);
      setMatchDuration(60);
      setRegistrationFee(0);
      setTournaments((prev) => [created, ...prev]);
      router.push(`/admin/tournaments/${created.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = async (t: TournamentListItem) => {
    try {
      const full = await tournamentsService.getById(t.id);
      setTournamentToEdit(full);
      setName(full.name);
      setCategoryId(full.category_id ?? null);
      setIsPuntuable(full.is_puntuable ?? false);
      setIsCategorySpecific(full.is_category_specific ?? false);
      setIsSuma13Damas(full.is_suma_13_damas ?? false);
      setMatchDuration(full.match_duration ?? 60);
      setHasSuperTiebreak(full.has_super_tiebreak ?? false);
      setRegistrationFee(full.registration_fee ?? 0);
      setEditDialogOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async () => {
    if (!tournamentToEdit || !name.trim()) return;
    try {
      setUpdating(true);
      const updated = await tournamentsService.update(tournamentToEdit.id, {
        name: name.trim(),
        category_id: isSuma13Damas ? (suma13Category?.id ?? null) : (isCategorySpecific ? categoryId : null),
        is_puntuable: isPuntuable,
        is_category_specific: isCategorySpecific && !isSuma13Damas,
        is_suma_13_damas: isSuma13Damas,
        match_duration: matchDuration,
        has_super_tiebreak: hasSuperTiebreak,
        registration_fee: registrationFee,
      });
      setTournaments((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, name: updated.name, category_id: updated.category_id, category: updated.category, is_puntuable: updated.is_puntuable, is_category_specific: updated.is_category_specific, is_suma_13_damas: updated.is_suma_13_damas } : t))
      );
      setEditDialogOpen(false);
      setTournamentToEdit(null);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2Icon className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <CardHeader className="p-0 flex items-center justify-between">
        <div>
          <CardTitle>Torneos</CardTitle>
          <CardDescription>
            Gestioná torneos, equipos, grupos y playoffs.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon className="w-4 h-4 mr-1" />
          Nuevo torneo
        </Button>
      </CardHeader>
      <CardContent className="p-0 pt-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <Label htmlFor="tournament-status-filter">Estado</Label>
            <Select
              defaultValue={statusFilter}
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as StatusFilterOption)
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isFiltering && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Actualizando...
            </div>
          )}
        </div>
        {tournaments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no creaste ningún torneo.
          </p>
        ) : (
          <div className="space-y-2">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="w-full text-left border rounded-lg px-4 py-3 hover:bg-muted flex items-center justify-between group"
              >
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => router.push(`/admin/tournaments/${t.id}`)}
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.category ?? "Sin categoría"} • {t.status}
                  </div>
                </button>
                {t.status === "draft" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 opacity-70 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog(t);
                    }}
                    aria-label="Editar torneo"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo torneo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Torneo 7ma Mixto"
              />
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="create-puntuable">Puntuable</Label>
                <p className="text-xs text-muted-foreground">Si suma para ranking o puntos</p>
              </div>
              <Switch id="create-puntuable" checked={isPuntuable} onCheckedChange={setIsPuntuable} />
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="create-suma-13">Suma 13 damas</Label>
                <p className="text-xs text-muted-foreground">Ambas mujeres; categorías damas suman ≥ 13</p>
              </div>
              <Switch
                id="create-suma-13"
                checked={isSuma13Damas}
                onCheckedChange={(checked) => {
                  setIsSuma13Damas(checked);
                  if (checked) setCategoryId(suma13Category?.id ?? null);
                  else if (!isCategorySpecific) setCategoryId(null);
                }}
              />
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="create-category-specific">De categoría específica (libre)</Label>
                <p className="text-xs text-muted-foreground">Restringir a una categoría</p>
              </div>
              <Switch
                id="create-category-specific"
                checked={isCategorySpecific}
                onCheckedChange={(checked) => {
                  setIsCategorySpecific(checked);
                  if (!checked && !isSuma13Damas) setCategoryId(null);
                }}
                disabled={isSuma13Damas}
              />
            </div>
            {isSuma13Damas && (
              <p className="text-sm text-muted-foreground">Categoría del torneo: Suma 13 damas (para ranking)</p>
            )}
            {isCategorySpecific && !isSuma13Damas && (
              <div className="space-y-1">
                <Label>Categoría</Label>
                <Select value={categoryId != null ? String(categoryId) : "_"} onValueChange={(v) => setCategoryId(v === "_" ? null : Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Duración del partido (minutos)</Label>
              <Input
                type="number"
                min="30"
                step="15"
                value={matchDuration}
                onChange={(e) => setMatchDuration(Number(e.target.value) || 90)}
                placeholder="60"
              />
              <p className="text-xs text-muted-foreground">
                Duración estimada de cada partido (por defecto 60 minutos)
              </p>
            </div>
            <div className="space-y-1">
              <Label>Cuota de inscripción</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={registrationFee}
                onChange={(e) => setRegistrationFee(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Monto en la moneda que uses (0 = sin cuota)
              </p>
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="super-tiebreak">Super Tie-Break en 3er set</Label>
                <p className="text-xs text-muted-foreground">
                  Se aplicará a todos los matches excepto cuartos, semifinal y final
                </p>
              </div>
              <Switch
                id="super-tiebreak"
                checked={hasSuperTiebreak}
                onCheckedChange={setHasSuperTiebreak}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
            >
              {creating && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear y abrir detalle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setTournamentToEdit(null);
            setName("");
            setCategoryId(null);
            setIsPuntuable(false);
            setIsCategorySpecific(false);
            setIsSuma13Damas(false);
            setMatchDuration(60);
            setHasSuperTiebreak(false);
            setRegistrationFee(0);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar torneo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Torneo 7ma Mixto"
              />
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="edit-puntuable">Puntuable</Label>
                <p className="text-xs text-muted-foreground">Si suma para ranking</p>
              </div>
              <Switch id="edit-puntuable" checked={isPuntuable} onCheckedChange={setIsPuntuable} />
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="edit-suma-13">Suma 13 damas</Label>
                <p className="text-xs text-muted-foreground">Ambas mujeres; categorías damas suman ≥ 13</p>
              </div>
              <Switch
                id="edit-suma-13"
                checked={isSuma13Damas}
                onCheckedChange={(checked) => {
                  setIsSuma13Damas(checked);
                  if (checked) setCategoryId(suma13Category?.id ?? null);
                  else if (!isCategorySpecific) setCategoryId(null);
                }}
              />
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="edit-category-specific">De categoría específica (libre)</Label>
                <p className="text-xs text-muted-foreground">Restringir a una categoría</p>
              </div>
              <Switch
                id="edit-category-specific"
                checked={isCategorySpecific}
                onCheckedChange={(checked) => {
                  setIsCategorySpecific(checked);
                  if (!checked && !isSuma13Damas) setCategoryId(null);
                }}
                disabled={isSuma13Damas}
              />
            </div>
            {isSuma13Damas && (
              <p className="text-sm text-muted-foreground">Categoría del torneo: Suma 13 damas (para ranking)</p>
            )}
            {isCategorySpecific && !isSuma13Damas && (
              <div className="space-y-1">
                <Label>Categoría</Label>
                <Select value={categoryId != null ? String(categoryId) : "_"} onValueChange={(v) => setCategoryId(v === "_" ? null : Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Duración del partido (minutos)</Label>
              <Input
                type="number"
                min="30"
                step="15"
                value={matchDuration}
                onChange={(e) => setMatchDuration(Number(e.target.value) || 90)}
                placeholder="60"
              />
              <p className="text-xs text-muted-foreground">
                Duración estimada de cada partido (por defecto 60 minutos)
              </p>
            </div>
            <div className="space-y-1">
              <Label>Cuota de inscripción</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={registrationFee}
                onChange={(e) => setRegistrationFee(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Monto en la moneda que uses (0 = sin cuota)
              </p>
            </div>
            <div className="flex items-center justify-between space-x-2 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="edit-super-tiebreak">Super Tie-Break en 3er set</Label>
                <p className="text-xs text-muted-foreground">
                  Se aplicará a todos los matches excepto cuartos, semifinal y final
                </p>
              </div>
              <Switch
                id="edit-super-tiebreak"
                checked={hasSuperTiebreak}
                onCheckedChange={setHasSuperTiebreak}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleUpdate}
              disabled={updating || !name.trim()}
            >
              {updating && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type StatusFilterOption = "active" | "all" | TournamentStatus;

const ACTIVE_STATUSES: TournamentStatus[] = [
  "draft",
  "schedule_review",
  "in_progress",
];

const statusFilterOptions: Array<{
  value: StatusFilterOption;
  label: string;
}> = [
  { value: "active", label: "Activos" },
  { value: "all", label: "Todos" },
  { value: "draft", label: "Inscripción" },
  { value: "schedule_review", label: "Revisión de horarios" },
  { value: "in_progress", label: "En progreso" },
  { value: "finished", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
];

const getStatusesForFilter = (
  option: StatusFilterOption
): TournamentStatus[] | undefined => {
  if (option === "all") {
    return undefined;
  }
  if (option === "active") {
    return ACTIVE_STATUSES;
  }
  return [option];
};
