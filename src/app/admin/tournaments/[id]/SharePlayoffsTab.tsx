"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tournamentsService } from "@/services";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import {
  TournamentBracketShare,
  type ShareBracketMatch,
} from "@/components/tournament-bracket-share";
import type { PlayoffRow, TeamDTO, TournamentDTO } from "@/models/dto/tournament";
import { SHARE_EXPORT_BG, scaleCanvasToShareWidth } from "@/lib/share-image-export";

function teamLabelBracket(team: TeamDTO | null) {
  if (!team) return "—";
  let name = team.display_name ?? "";
  if (!name) {
    const lastName1 = team.player1?.last_name ?? "";
    const lastName2 = team.player2?.last_name ?? "";
    if (!lastName1 && !lastName2) return "—";
    name = `${lastName1} / ${lastName2}`.replace(/^\/\s*|\s*\/\s*$/g, "").trim();
  }
  return name || "—";
}

function getWinner(match: NonNullable<PlayoffRow["match"]>) {
  if (match.status !== "finished") return null;
  let team1Sets = 0;
  let team2Sets = 0;
  if (match.set1_team1_games != null && match.set1_team2_games != null) {
    if (match.set1_team1_games > match.set1_team2_games) team1Sets++;
    else if (match.set1_team2_games > match.set1_team1_games) team2Sets++;
  }
  if (match.set2_team1_games != null && match.set2_team2_games != null) {
    if (match.set2_team1_games > match.set2_team2_games) team1Sets++;
    else if (match.set2_team2_games > match.set2_team1_games) team2Sets++;
  }
  if (match.set3_team1_games != null && match.set3_team2_games != null) {
    if (match.set3_team1_games > match.set3_team2_games) team1Sets++;
    else if (match.set3_team2_games > match.set3_team1_games) team2Sets++;
  }
  if (team1Sets === 0 && team2Sets === 0) return null;
  return team1Sets > team2Sets ? match.team1 : match.team2;
}

function buildShareBracket(rows: PlayoffRow[]): {
  rounds: string[];
  matchesByRound: Record<string, ShareBracketMatch[]>;
} | null {
  if (!rows.length) return null;

  const roundOrder: Record<string, number> = {
    "16avos": 1,
    octavos: 2,
    cuartos: 3,
    semifinal: 4,
    final: 5,
  };

  const rounds = Array.from(new Set(rows.map((r) => r.round))).sort(
    (a, b) => (roundOrder[a] ?? 99) - (roundOrder[b] ?? 99),
  );

  const matchesByRound: Record<string, ShareBracketMatch[]> = {};

  rows.forEach((r) => {
    if (!r.match) return;
    const match = r.match;
    const winner = getWinner(match);
    const scores =
      match.status === "finished" && match.team1 && match.team2
        ? [
            match.set1_team1_games != null && match.set1_team2_games != null
              ? `${match.set1_team1_games}-${match.set1_team2_games}`
              : null,
            match.set2_team1_games != null && match.set2_team2_games != null
              ? `${match.set2_team1_games}-${match.set2_team2_games}`
              : null,
            match.set3_team1_games != null && match.set3_team2_games != null
              ? `${match.set3_team1_games}-${match.set3_team2_games}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ")
        : undefined;

    const isBye =
      ((!match.team1 && match.team2) || (match.team1 && !match.team2)) &&
      !r.source_team1 &&
      !r.source_team2;
    if (!matchesByRound[r.round]) matchesByRound[r.round] = [];
    matchesByRound[r.round].push({
      id: match.id,
      round: r.round,
      bracketPos: r.bracket_pos,
      team1: match.team1
        ? { id: match.team1.id, name: teamLabelBracket(match.team1) }
        : null,
      team2: match.team2
        ? { id: match.team2.id, name: teamLabelBracket(match.team2) }
        : null,
      winner: isBye
        ? match.team1
          ? { id: match.team1.id }
          : match.team2
            ? { id: match.team2.id }
            : undefined
        : winner
          ? { id: winner.id }
          : undefined,
      isFinished: isBye ? true : match.status === "finished",
      isBye: !!isBye,
      scores: isBye ? undefined : scores,
      sourceTeam1: isBye ? null : r.source_team1,
      sourceTeam2: isBye ? null : r.source_team2,
      matchDate: isBye ? null : match.match_date,
      startTime: isBye ? null : match.start_time,
    });
  });

  Object.values(matchesByRound).forEach((list) =>
    list.sort((a, b) => (a.bracketPos ?? 999) - (b.bracketPos ?? 999)),
  );

  return { rounds, matchesByRound };
}

export default function SharePlayoffsTab({
  tournament,
}: {
  tournament: Pick<
    TournamentDTO,
    "id" | "name" | "category" | "is_puntuable" | "is_category_specific"
  >;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["tournament-playoffs", tournament.id],
    queryFn: () => tournamentsService.getPlayoffs(tournament.id),
    staleTime: 1000 * 30,
  });

  const bracket = useMemo(() => buildShareBracket(rows), [rows]);
  const captureRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);

  const handleCopyImage = async () => {
    const el = captureRef.current;
    if (!el) {
      toast.error("Error al copiar la imagen");
      return;
    }

    setCopying(true);
    try {
      const { toPng } = await import("html-to-image");

      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 400));

      el.classList.add("minimal-bracket-exporting");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      await new Promise<void>((resolve) => {
        const logo = new Image();
        logo.crossOrigin = "anonymous";
        logo.onload = () => resolve();
        logo.onerror = () => resolve();
        logo.src = "/PCP-logo.png";
      });

      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: SHARE_EXPORT_BG,
        cacheBust: true,
        filter: (node: Node) => {
          if (node instanceof HTMLElement) {
            return !node.closest("[data-share-playoffs-exclude]");
          }
          return true;
        },
      });

      el.classList.remove("minimal-bracket-exporting");

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
      });

      const raw = document.createElement("canvas");
      raw.width = img.width;
      raw.height = img.height;
      raw.getContext("2d")!.drawImage(img, 0, 0);

      const canvas = scaleCanvasToShareWidth(raw, 1080, 0, SHARE_EXPORT_BG);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1),
      );
      if (!blob) throw new Error("Error al generar imagen");

      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (error) {
      console.error("Error copying playoffs bracket:", error);
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

  if (!bracket) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Todavía no hay cuadro de playoffs para compartir.
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
        <TournamentBracketShare
          ref={captureRef}
          rounds={bracket.rounds}
          matchesByRound={bracket.matchesByRound}
          tournamentName={tournament.name}
          tournamentCategory={tournament.category}
          isCategorySpecific={tournament.is_category_specific}
          isPuntuable={tournament.is_puntuable}
        />
      </div>
    </div>
  );
}
