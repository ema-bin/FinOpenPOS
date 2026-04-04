"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { playerMatchesCategoryFilter } from "@/lib/player-category-filter";
import type { PlayerDTO } from "@/models/dto/player";
import type { Category } from "@/models/db/category";

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

interface PlayerSearchSelectProps {
  players: PlayerDTO[];
  value: number | null;
  onValueChange: (playerId: number | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Mostrar selector de categoría (libre/damas) sobre la búsqueda. Por defecto true. */
  showCategoryFilter?: boolean;
}

function fullName(player: PlayerDTO): string {
  return [player.first_name, player.last_name].filter(Boolean).join(" ");
}

export function PlayerSearchSelect({
  players,
  value,
  onValueChange,
  placeholder = "Seleccionar cliente...",
  emptyMessage = "No se encontró ningún cliente.",
  searchPlaceholder = "Buscar por nombre o apellido...",
  disabled = false,
  showCategoryFilter = true,
}: PlayerSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null);
  const [popoverWidth, setPopoverWidth] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "all"],
    queryFn: fetchCategories,
    staleTime: 1000 * 60 * 30,
    enabled: showCategoryFilter,
  });

  // Debounce search para evitar filtros costosos en cada keystroke
  const debouncedSearch = useDebounce(search, 300);

  const playersByCategory = useMemo(() => {
    if (!showCategoryFilter) return players;
    return players.filter((p) =>
      playerMatchesCategoryFilter(p, categoryFilterId)
    );
  }, [players, categoryFilterId, showCategoryFilter]);

  // Filtrar jugadores por búsqueda
  const filteredPlayers = useMemo(() => {
    if (!debouncedSearch.trim()) return playersByCategory;
    const searchLower = debouncedSearch.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/).filter(Boolean);
    
    return playersByCategory.filter((p) => {
      const firstName = p.first_name.toLowerCase();
      const lastName = p.last_name.toLowerCase();
      const fullNameLower = fullName(p).toLowerCase();
      
      // Si hay un solo término, buscar en cualquier campo
      if (searchTerms.length === 1) {
        const term = searchTerms[0];
        return (
          firstName.includes(term) ||
          lastName.includes(term) ||
          fullNameLower.includes(term)
        );
      }
      
      // Si hay múltiples términos, buscar que coincidan con nombre y apellido
      // (en cualquier orden)
      if (searchTerms.length >= 2) {
        const [term1, term2] = searchTerms;
        // Nombre apellido
        const match1 = firstName.includes(term1) && lastName.includes(term2);
        // Apellido nombre
        const match2 = firstName.includes(term2) && lastName.includes(term1);
        // Ambos términos en nombre
        const match3 = firstName.includes(term1) && firstName.includes(term2);
        // Ambos términos en apellido
        const match4 = lastName.includes(term1) && lastName.includes(term2);
        
        return match1 || match2 || match3 || match4;
      }
      
      return false;
    });
  }, [playersByCategory, debouncedSearch]);

  const selectedPlayer = value
    ? players.find((p) => p.id === value)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
          onMouseEnter={() => {
            if (triggerRef.current) {
              setPopoverWidth(triggerRef.current.offsetWidth);
            }
          }}
        >
          {selectedPlayer
            ? fullName(selectedPlayer)
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{
          width: popoverWidth || "var(--radix-popover-trigger-width)",
        }}
      >
        <Command shouldFilter={false}>
          {showCategoryFilter && (
            <div className="border-b px-3 py-2 space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Categoría
              </Label>
              <Select
                value={categoryFilterId === null ? "all" : String(categoryFilterId)}
                onValueChange={(v) =>
                  setCategoryFilterId(v === "all" ? null : Number(v))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.type === "libre" ? " (Libre)" : " (Damas)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filteredPlayers.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredPlayers.map((player) => (
                  <CommandItem
                    key={player.id}
                    value={`${player.first_name} ${player.last_name}`}
                    onSelect={() => {
                      onValueChange(player.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === player.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {fullName(player)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

