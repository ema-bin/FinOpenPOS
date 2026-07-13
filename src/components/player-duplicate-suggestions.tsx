"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { playersService } from "@/services/players.service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlayerDuplicateSuggestionsProps = {
  firstName: string;
  lastName: string;
  phone: string;
  enabled?: boolean;
  excludePlayerId?: number | null;
  onSelectExisting?: (playerId: number) => void;
  className?: string;
};

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function PlayerDuplicateSuggestions({
  firstName,
  lastName,
  phone,
  enabled = true,
  excludePlayerId = null,
  onSelectExisting,
  className,
}: PlayerDuplicateSuggestionsProps) {
  const debouncedFirstName = useDebounce(firstName.trim(), 350);
  const debouncedLastName = useDebounce(lastName.trim(), 350);
  const debouncedPhone = useDebounce(phone.trim(), 350);

  const { data, isFetching } = useQuery({
    queryKey: [
      "player-duplicate-suggestions",
      debouncedFirstName,
      debouncedLastName,
      debouncedPhone,
      excludePlayerId,
    ],
    queryFn: () =>
      playersService.getDuplicateSuggestions({
        first_name: debouncedFirstName,
        last_name: debouncedLastName,
        phone: debouncedPhone,
        exclude_id: excludePlayerId,
      }),
    enabled,
    staleTime: 1000 * 30,
  });

  const suggestions = data?.suggestions ?? [];
  if (!enabled || suggestions.length === 0) return null;

  const hasHighConfidence = suggestions.some((item) => item.score >= 0.9);

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-md border px-3 py-3 text-sm",
        hasHighConfidence
          ? "border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50"
          : "border-muted-foreground/20 bg-muted/40",
        className
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">
            {hasHighConfidence
              ? "Puede que este cliente ya exista"
              : "Clientes similares encontrados"}
          </p>
          <p className="text-xs text-muted-foreground">
            Revisá antes de crear uno nuevo. La coincidencia no es exacta.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {suggestions.map((item) => (
          <li
            key={item.player.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">
                {item.player.first_name} {item.player.last_name}
                {item.player.status === "inactive" ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (inactivo)
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {item.player.phone || "Sin teléfono"}
                {item.player.city ? ` · ${item.player.city}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.reasons.join(" · ")} · {formatScore(item.score)}
              </p>
            </div>
            {onSelectExisting ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelectExisting(item.player.id)}
              >
                Usar este
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {isFetching ? (
        <p className="mt-2 text-xs text-muted-foreground">Buscando coincidencias…</p>
      ) : null}
    </div>
  );
}
