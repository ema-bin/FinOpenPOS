"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/useDebounce";

export type PlayerHit = { id: number; first_name: string; last_name: string };

export function PlayerSearch({
  excludeIds,
  onPick,
  placeholder = "Buscar jugador",
}: {
  excludeIds: number[];
  onPick: (player: PlayerHit) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const { data = [], isFetching } = useQuery({
    queryKey: ["players", "class-search", debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const response = await fetch(`/api/players?q=${encodeURIComponent(debounced.trim())}`);
      if (!response.ok) throw new Error("No se pudieron buscar jugadores");
      return (await response.json()) as PlayerHit[];
    },
  });

  const hits = data.filter((player) => !excludeIds.includes(player.id)).slice(0, 8);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
      />
      {debounced.trim().length >= 2 && (
        <div className="rounded-md border">
          {isFetching && hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
          ) : (
            hits.map((player) => (
              <Button
                key={player.id}
                type="button"
                variant="ghost"
                className="h-9 w-full justify-start rounded-none"
                onClick={() => {
                  onPick(player);
                  setQuery("");
                }}
              >
                {player.last_name}, {player.first_name}
              </Button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
