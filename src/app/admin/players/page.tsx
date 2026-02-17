"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import {
  Loader2Icon,
  PlusCircle,
  Trash2,
  SearchIcon,
  FilterIcon,
  FilePenIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import type { PlayerDTO } from "@/models/dto/player";
import type { PlayerStatus } from "@/models/db/player";
import type { Category } from "@/models/db/category";
import { playersService } from "@/services/players.service";

type Player = PlayerDTO;

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNewPlayerDialog, setShowNewPlayerDialog] = useState(false);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState("");
  const [newPlayerLastName, setNewPlayerLastName] = useState("");
  const [newPlayerPhone, setNewPlayerPhone] = useState("");
  const [newPlayerCity, setNewPlayerCity] = useState("");
  const [newPlayerStatus, setNewPlayerStatus] =
    useState<PlayerStatus>("active");
  const [newPlayerCategoryId, setNewPlayerCategoryId] = useState<number | null>(null);
  const [newPlayerGender, setNewPlayerGender] = useState<string>("");
  const [newPlayerFemaleCategoryId, setNewPlayerFemaleCategoryId] = useState<number | null>(null);
  const [isEditPlayerDialogOpen, setIsEditPlayerDialogOpen] =
    useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] =
    useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    status: "active" as "all" | PlayerStatus,
  });
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(
    null
  );

  const queryClient = useQueryClient();

  const { data: categoriesLibre = [] } = useQuery<Category[]>({
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

  // React Query para compartir cache con otros componentes
  const {
    data: playersData = [],
    isLoading: loadingPlayers,
    refetch: refetchPlayers,
  } = useQuery({
    queryKey: ["players", filters.status], // Mismo key que TeamsTab y OrdersPage
    queryFn: () => playersService.getAll(filters.status),
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  // Sincronizar playersData con estado local para compatibilidad
  useEffect(() => {
    setPlayers(playersData);
  }, [playersData]);

  const loading = loadingPlayers;

  // Debounce search term para evitar filtros costosos en cada keystroke
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      if (filters.status !== "all" && player.status !== filters.status) {
        return false;
      }
      const term = debouncedSearchTerm.toLowerCase();
      return (
        player.first_name.toLowerCase().includes(term) ||
        (player.last_name ?? "").toLowerCase().includes(term) ||
        (player.phone ?? "").includes(debouncedSearchTerm) ||
        (player.city ?? "").toLowerCase().includes(term)
      );
    });
  }, [players, filters.status, debouncedSearchTerm]);

  const resetSelectedPlayer = () => {
    setSelectedPlayerId(null);
    setNewPlayerFirstName("");
    setNewPlayerLastName("");
    setNewPlayerPhone("");
    setNewPlayerCity("");
    setNewPlayerStatus("active");
    setNewPlayerCategoryId(null);
    setNewPlayerGender("");
    setNewPlayerFemaleCategoryId(null);
  };

  const handleAddPlayer = useCallback(async () => {
    try {
      const createdPlayer = await playersService.create({
        first_name: newPlayerFirstName,
        last_name: newPlayerLastName,
        phone: newPlayerPhone,
        status: newPlayerStatus,
        city: newPlayerCity.trim() || null,
        category_id: newPlayerCategoryId,
        female_category_id: newPlayerGender === "female" ? newPlayerFemaleCategoryId : null,
        gender: newPlayerGender || null,
      });
      setPlayers((prev) => [...prev, createdPlayer]);
      setShowNewPlayerDialog(false);
      resetSelectedPlayer();
    } catch (error) {
      console.error(error);
      // acá podrías setear un toast/error UI si querés
    }
  }, [newPlayerFirstName, newPlayerLastName, newPlayerPhone, newPlayerCity, newPlayerStatus, newPlayerCategoryId, newPlayerGender, newPlayerFemaleCategoryId]);

  const handleEditPlayer = useCallback(async () => {
    if (!selectedPlayerId) return;
    try {
      await playersService.update(selectedPlayerId, {
        first_name: newPlayerFirstName,
        last_name: newPlayerLastName,
        phone: newPlayerPhone,
        status: newPlayerStatus,
        city: newPlayerCity.trim() || null,
        category_id: newPlayerCategoryId,
        female_category_id: newPlayerGender === "female" ? newPlayerFemaleCategoryId : null,
        gender: newPlayerGender || null,
      });
      // Invalidar cache para refrescar players
      queryClient.invalidateQueries({ queryKey: ["players"] });
      setIsEditPlayerDialogOpen(false);
      resetSelectedPlayer();
    } catch (error) {
      console.error(error);
    }
  }, [
    selectedPlayerId,
    newPlayerFirstName,
    newPlayerLastName,
    newPlayerPhone,
    newPlayerCity,
    newPlayerStatus,
    newPlayerCategoryId,
    newPlayerGender,
    newPlayerFemaleCategoryId,
    queryClient,
  ]);

  const handleDeletePlayer = useCallback(async () => {
    if (!playerToDelete) return;
    try {
      await playersService.delete(playerToDelete.id);

      // Nuestro backend hace soft-delete (status = 'inactive'),
      // así que reflejamos eso en el estado en vez de borrar el cliente.
      setPlayers((prev) =>
        prev.map((c) =>
          c.id === playerToDelete.id ? { ...c, status: "inactive" } : c
        )
      );
      setIsDeleteConfirmationOpen(false);
      setPlayerToDelete(null);
    } catch (error) {
      console.error(error);
    }
  }, [playerToDelete]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (value: "all" | PlayerStatus) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      status: value,
    }));
  };

  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2Icon className="mx-auto h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Players</h1>
        <Card>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      <CardHeader className="p-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Buscar Clientes..."
                value={searchTerm}
                onChange={handleSearch}
                className="pr-8"
              />
              <SearchIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <FilterIcon className="w-4 h-4" />
                  <span>Filtros</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Filtrar por Estado</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={filters.status === "all"}
                  onCheckedChange={() => handleFilterChange("all")}
                >
                  Todos
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.status === "active"}
                  onCheckedChange={() => handleFilterChange("active")}
                >
                  Activos
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.status === "inactive"}
                  onCheckedChange={() => handleFilterChange("inactive")}
                >
                  Inactivos
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button size="sm" onClick={() => setShowNewPlayerDialog(true)}>
            <PlusCircle className="w-4 h-4 mr-2" />
            Nuevo Cliente
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Apellido</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlayers.map((player) => (
                <TableRow key={player.id}>
                  <TableCell>{player.first_name}</TableCell>
                  <TableCell>{player.last_name}</TableCell>
                  <TableCell>{player.phone}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{player.city ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {[player.category, player.female_category].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="capitalize">
                    {player.status}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setSelectedPlayerId(player.id);
                          setNewPlayerFirstName(player.first_name);
                          setNewPlayerLastName(player.last_name ?? "");
                          setNewPlayerPhone(player.phone ?? "");
                          setNewPlayerCity(player.city ?? "");
                          setNewPlayerStatus(player.status);
                          setNewPlayerCategoryId(player.category_id ?? null);
                          setNewPlayerGender(player.gender ?? "");
                          setNewPlayerFemaleCategoryId(player.female_category_id ?? null);
                          setIsEditPlayerDialogOpen(true);
                        }}
                      >
                        <FilePenIcon className="w-4 h-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setPlayerToDelete(player);
                          setIsDeleteConfirmationOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredPlayers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6">
                    No se encontraron clientes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between items-center">
        {/* Pagination can go here later */}
      </CardFooter>

      {/* Create / Edit dialog */}
      <Dialog
        open={showNewPlayerDialog || isEditPlayerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewPlayerDialog(false);
            setIsEditPlayerDialogOpen(false);
            resetSelectedPlayer();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showNewPlayerDialog ? "Crear Nuevo Cliente" : "Editar Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="firstName"
                value={newPlayerFirstName}
                onChange={(e) => setNewPlayerFirstName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lastName">Apellido</Label>
              <Input
                id="lastName"
                value={newPlayerLastName}
                onChange={(e) => setNewPlayerLastName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={newPlayerPhone}
                onChange={(e) => setNewPlayerPhone(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                value={newPlayerCity}
                onChange={(e) => setNewPlayerCity(e.target.value)}
                placeholder="Opcional"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label>Categoría (libre)</Label>
              <Select value={newPlayerCategoryId != null ? String(newPlayerCategoryId) : "_"} onValueChange={(v) => setNewPlayerCategoryId(v === "_" ? null : Number(v))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">Sin categoría</SelectItem>
                  {categoriesLibre.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label>Género</Label>
              <Select value={newPlayerGender || "_"} onValueChange={(v) => { setNewPlayerGender(v === "_" ? "" : v); if (v !== "female") setNewPlayerFemaleCategoryId(null); }}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="No especificado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">No especificado</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="female">Femenino (damas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newPlayerGender === "female" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label>Categoría damas</Label>
                <Select value={newPlayerFemaleCategoryId != null ? String(newPlayerFemaleCategoryId) : "_"} onValueChange={(v) => setNewPlayerFemaleCategoryId(v === "_" ? null : Number(v))}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Sin categoría damas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">Sin categoría damas</SelectItem>
                    {categoriesDamas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={newPlayerStatus}
                onValueChange={(value: PlayerStatus) =>
                  setNewPlayerStatus(value)
                }
              >
                <SelectTrigger id="status" className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowNewPlayerDialog(false);
                setIsEditPlayerDialogOpen(false);
                resetSelectedPlayer();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={
                showNewPlayerDialog ? handleAddPlayer : handleEditPlayer
              }
            >
              {showNewPlayerDialog ? "Crear Cliente" : "Editar Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        open={isDeleteConfirmationOpen}
        onOpenChange={setIsDeleteConfirmationOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete this player? This will mark them
            as inactive.
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsDeleteConfirmationOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeletePlayer}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
