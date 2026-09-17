"use client";

import { useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroupTeamDTO, MatchDTO, TeamDTO } from "@/models/dto/tournament";
import {
  GROUP_OF_FOUR_PAIRING_PRESETS,
  detectGroupOfFourPairingPreset,
  orderGroupOfFourTeamIds,
  type GroupOfFourPairingPreset,
} from "@/lib/group-of-four-pairings";
import { compareTeamsByDisplayOrder } from "@/lib/group-zone-team-order";

function teamShortLabel(team: TeamDTO, seedIndex: number): string {
  const name =
    team.display_name?.trim() ||
    `${team.player1?.last_name ?? ""} / ${team.player2?.last_name ?? ""}`.trim();
  return `${seedIndex}. ${name || `Equipo ${team.id}`}`;
}

type Props = {
  tournamentId: number;
  groupId: number;
  groupName: string;
  groupTeams: GroupTeamDTO[];
  matches: MatchDTO[];
  onUpdated: () => void;
};

export function GroupOfFourPairingEditor({
  tournamentId,
  groupId,
  groupName,
  groupTeams,
  matches,
  onUpdated,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [customTeamA, setCustomTeamA] = useState<string>("");
  const [customTeamB, setCustomTeamB] = useState<string>("");

  const teamRows = useMemo(() => {
    const teams = groupTeams
      .map((gt) => gt.team)
      .filter((t): t is TeamDTO => t != null);
    return [...teams].sort(compareTeamsByDisplayOrder);
  }, [groupTeams]);

  const orderedTeamIds = useMemo(
    () => orderGroupOfFourTeamIds(teamRows.map((t) => t.id), teamRows),
    [teamRows]
  );

  const seedIndexByTeamId = useMemo(() => {
    const map = new Map<number, number>();
    orderedTeamIds.forEach((id, idx) => map.set(id, idx + 1));
    return map;
  }, [orderedTeamIds]);

  const firstRoundMatches = matches.filter(
    (m) => m.tournament_group_id === groupId && (m.match_order === 1 || m.match_order === 2)
  );
  const m1 = firstRoundMatches.find((m) => m.match_order === 1);
  const m2 = firstRoundMatches.find((m) => m.match_order === 2);
  const m3 = matches.find(
    (m) => m.tournament_group_id === groupId && m.match_order === 3
  );
  const m4 = matches.find(
    (m) => m.tournament_group_id === groupId && m.match_order === 4
  );

  const canEdit =
    m1 &&
    m2 &&
    m1.status !== "finished" &&
    m2.status !== "finished" &&
    m1.set1_team1_games == null &&
    m2.set1_team1_games == null &&
    !m3?.team1?.id &&
    !m3?.team2?.id &&
    !m4?.team1?.id &&
    !m4?.team2?.id;

  const currentPreset = useMemo(() => {
    const m1t1 = m1?.team1?.id;
    const m1t2 = m1?.team2?.id;
    const m2t1 = m2?.team1?.id;
    const m2t2 = m2?.team2?.id;
    if (!m1t1 || !m1t2 || !m2t1 || !m2t2) {
      return null;
    }
    return detectGroupOfFourPairingPreset(
      orderedTeamIds as [number, number, number, number],
      [m1t1, m1t2],
      [m2t1, m2t2]
    );
  }, [m1, m2, orderedTeamIds]);

  const applyPreset = async (preset: GroupOfFourPairingPreset) => {
    try {
      setSaving(true);
      const res = await fetch(
        `/api/tournaments/${tournamentId}/groups/${groupId}/first-round-pairing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preset }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo actualizar el emparejamiento");
        return;
      }
      toast.success(`Emparejamiento actualizado (${groupName})`);
      onUpdated();
    } catch {
      toast.error("Error de red al guardar emparejamiento");
    } finally {
      setSaving(false);
    }
  };

  const applyCustom = async () => {
    const a = Number(customTeamA);
    const b = Number(customTeamB);
    if (!a || !b || a === b) {
      toast.error("Elegí dos equipos distintos para el partido 1");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(
        `/api/tournaments/${tournamentId}/groups/${groupId}/first-round-pairing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            match1_team1_id: a,
            match1_team2_id: b,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo actualizar el emparejamiento");
        return;
      }
      toast.success(`Emparejamiento actualizado (${groupName})`);
      onUpdated();
    } catch {
      toast.error("Error de red al guardar emparejamiento");
    } finally {
      setSaving(false);
    }
  };

  if (teamRows.length !== 4) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">{groupName} — 1ª ronda</p>
        <p className="text-xs text-muted-foreground">
          Números 1–4 = orden en la zona (1 = cabeza). Partidos 3 y 4 se arman con ganadores/perdedores.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {GROUP_OF_FOUR_PAIRING_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant={currentPreset === preset.id ? "default" : "outline"}
            disabled={!canEdit || saving}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Partido 1 — equipo A</Label>
          <Select
            value={customTeamA}
            onValueChange={setCustomTeamA}
            disabled={!canEdit || saving}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Elegir equipo" />
            </SelectTrigger>
            <SelectContent>
              {teamRows.map((team) => (
                <SelectItem key={team.id} value={String(team.id)}>
                  {teamShortLabel(team, seedIndexByTeamId.get(team.id) ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Partido 1 — equipo B</Label>
          <Select
            value={customTeamB}
            onValueChange={setCustomTeamB}
            disabled={!canEdit || saving}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Elegir equipo" />
            </SelectTrigger>
            <SelectContent>
              {teamRows.map((team) => (
                <SelectItem key={team.id} value={String(team.id)}>
                  {teamShortLabel(team, seedIndexByTeamId.get(team.id) ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canEdit || saving || !customTeamA || !customTeamB}
          onClick={applyCustom}
        >
          {saving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Aplicar"}
        </Button>
      </div>

      {!canEdit && (
        <p className="text-xs text-amber-700">
          No se puede cambiar: ya hay resultados o partidos de definición generados.
        </p>
      )}
    </div>
  );
}
