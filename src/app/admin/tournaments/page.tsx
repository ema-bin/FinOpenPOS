"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2Icon, PlusIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { TournamentListItem } from "@/models/dto/tournament";
import type { TournamentStatus } from "@/models/db/tournament";
import { tournamentsService } from "@/services";

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [hasSuperTiebreak, setHasSuperTiebreak] = useState(false);
  const [matchDuration, setMatchDuration] = useState<number>(60);
  const [creating, setCreating] = useState(false);
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
        registration_deadline: "",
        format: category || null,
        description: null,
      });
      setDialogOpen(false);
      setName("");
      setCategory("");
      setHasSuperTiebreak(false);
      setMatchDuration(60);
      setTournaments((prev) => [created, ...prev]);
      router.push(`/admin/tournaments/${created.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
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
              id="tournament-status-filter"
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
              <button
                key={t.id}
                className="w-full text-left border rounded-lg px-4 py-3 hover:bg-muted flex items-center justify-between"
                onClick={() => router.push(`/admin/tournaments/${t.id}`)}
              >
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.category ?? "Sin categoría"} • {t.status}
                  </div>
                </div>
              </button>
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
            <div className="space-y-1">
              <Label>Categoría (opcional)</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ej: 7ma, 6ta, Mixto"
              />
            </div>
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
