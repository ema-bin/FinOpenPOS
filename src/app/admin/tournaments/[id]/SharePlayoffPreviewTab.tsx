"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import {
  TournamentBracketShareCentered,
  type ShareBracketMatch,
} from "@/components/tournament-bracket-share-centered";
import type { TournamentDTO } from "@/models/dto/tournament";
import { copySharePlayoffsBracketToClipboard } from "@/lib/copy-share-playoffs-bracket";
import { BRACKET_SHARE_LAYOUT_CENTERED_EXPORT } from "@/lib/playoffs-bracket-share-layout";

type PreviewMatch = {
  id?: number;
  round: string;
  bracket_pos: number;
  team1_id: number | null;
  team2_id: number | null;
  source_team1: string | null;
  source_team2: string | null;
  display_team1?: string | null;
  display_team2?: string | null;
  match_date: string | null;
  start_time: string | null;
};

type PreviewResponse = {
  matches: PreviewMatch[];
  slotsNeeded: number;
  slotsAvailable: number;
  placeholdersUsed: boolean;
};

const roundOrder: Record<string, number> = {
  "16avos": 1,
  octavos: 2,
  cuartos: 3,
  semifinal: 4,
  final: 5,
};

async function fetchPreview(tournamentId: number): Promise<PreviewResponse> {
  const response = await fetch(`/api/tournaments/${tournamentId}/playoff-preview`, {
    method: "POST",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to generate preview");
  }
  return response.json();
}

function teamEntry(
  teamId: number | null,
  name: string,
  syntheticId: number,
): { id: number; name: string } | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed === "—") return null;
  if (teamId) return { id: teamId, name: trimmed };
  return { id: syntheticId, name: trimmed };
}

function buildShareBracketFromPreview(matches: PreviewMatch[]): {
  rounds: string[];
  matchesByRound: Record<string, ShareBracketMatch[]>;
} | null {
  if (!matches.length) return null;

  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort(
    (a, b) => (roundOrder[a] ?? 99) - (roundOrder[b] ?? 99),
  );

  const matchesByRound: Record<string, ShareBracketMatch[]> = {};

  matches.forEach((m) => {
    const team1Name = m.display_team1 ?? m.source_team1 ?? "—";
    const team2Name = m.display_team2 ?? m.source_team2 ?? "—";
    const syntheticBase = m.bracket_pos * 10;
    const team1 = teamEntry(m.team1_id, team1Name, -(syntheticBase + 1));
    const team2 = teamEntry(m.team2_id, team2Name, -(syntheticBase + 2));

    const isBye =
      ((!team1 && team2) || (team1 && !team2)) &&
      !m.source_team1 &&
      !m.source_team2;

    if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
    matchesByRound[m.round].push({
      id: m.id ?? syntheticBase + rounds.indexOf(m.round) * 1000,
      round: m.round,
      bracketPos: m.bracket_pos,
      team1,
      team2,
      winner: isBye
        ? team1
          ? { id: team1.id }
          : team2
            ? { id: team2.id }
            : undefined
        : undefined,
      isFinished: false,
      isBye: !!isBye,
      sourceTeam1: isBye ? null : m.source_team1,
      sourceTeam2: isBye ? null : m.source_team2,
      matchDate: isBye ? null : m.match_date,
      startTime: isBye ? null : m.start_time,
    });
  });

  Object.values(matchesByRound).forEach((list) =>
    list.sort((a, b) => (a.bracketPos ?? 999) - (b.bracketPos ?? 999)),
  );

  return { rounds, matchesByRound };
}

export default function SharePlayoffPreviewTab({
  tournament,
}: {
  tournament: Pick<
    TournamentDTO,
    "id" | "name" | "category" | "is_puntuable" | "is_category_specific"
  >;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tournament-playoff-preview", tournament.id],
    queryFn: () => fetchPreview(tournament.id),
    staleTime: 1000 * 30,
  });

  const bracket = useMemo(
    () => (data?.matches ? buildShareBracketFromPreview(data.matches) : null),
    [data?.matches],
  );
  const captureRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  const [exportLayout, setExportLayout] = useState(false);

  const handleCopyImage = async () => {
    const el = captureRef.current;
    if (!el) {
      toast.error("Error al copiar la imagen");
      return;
    }

    setCopying(true);
    try {
      await copySharePlayoffsBracketToClipboard(el, setExportLayout, { portrait: true });
      toast.success("Imagen copiada al portapapeles");
    } catch (copyError) {
      console.error("Error copying playoff preview bracket:", copyError);
      toast.error("Error al copiar la imagen al portapapeles");
    } finally {
      setCopying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError || !bracket) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : "No se pudo generar la vista previa de playoffs para compartir."}
      </p>
    );
  }

  return (
    <div className="share-playoffs-tab -mx-1 space-y-1">
      <div className="flex justify-end px-1" data-share-playoffs-exclude>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={copying}
          onClick={handleCopyImage}
        >
          {copying ? (
            <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <CopyIcon className="mr-1 h-3 w-3" />
          )}
          Copiar imagen
        </Button>
      </div>

      <div className="overflow-x-auto">
        <TournamentBracketShareCentered
          ref={captureRef}
          rounds={bracket.rounds}
          matchesByRound={bracket.matchesByRound}
          tournamentName={tournament.name}
          tournamentCategory={tournament.category}
          isCategorySpecific={tournament.is_category_specific}
          isPuntuable={tournament.is_puntuable}
          shareVariant="preview"
          layout={exportLayout ? BRACKET_SHARE_LAYOUT_CENTERED_EXPORT : undefined}
        />
      </div>
    </div>
  );
}
