"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Loader2Icon, MedalIcon, Settings2Icon } from "lucide-react";
import type { Category } from "@/models/db/category";
import type { TournamentRankingPointRule } from "@/models/db/tournament-ranking-point-rule";

const ROUND_LABELS: Record<string, string> = {
  champion: "Campeón",
  final: "Final",
  semifinal: "Semifinal",
  cuartos: "Cuartos",
  octavos: "Octavos",
  "16avos": "16avos",
  groups: "Grupos (no clasifica)",
};

type RankingRow = {
  position: number;
  player_id: number;
  first_name: string;
  last_name: string;
  total_points: number;
  tournaments_played: number;
};

type RankingResponse = {
  category_id: number;
  year: number;
  rows: RankingRow[];
};

export function RankingPuntuableSection() {
  const currentYear = new Date().getFullYear();

  const { data: categories = [], isLoading: loadingCategories } = useQuery<
    Category[]
  >({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (categories.length > 0 && selectedCategoryId == null) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const { data: ranking, isLoading: loadingRanking } = useQuery<RankingResponse>(
    {
      queryKey: ["ranking", selectedCategoryId, currentYear],
      queryFn: async () => {
        if (selectedCategoryId == null) {
          return { category_id: 0, year: currentYear, rows: [] };
        }
        const res = await fetch(
          `/api/ranking?category_id=${selectedCategoryId}&year=${currentYear}`
        );
        if (!res.ok) throw new Error("Failed to fetch ranking");
        return res.json();
      },
      enabled: selectedCategoryId != null,
      staleTime: 1000 * 60,
    }
  );

  const effectiveCategoryId = selectedCategoryId ?? categories[0]?.id ?? null;
  const categoryName =
    categories.find((c) => c.id === effectiveCategoryId)?.name ?? "Categoría";

  const { data: pointRules = [], isLoading: loadingRules } = useQuery<
    TournamentRankingPointRule[]
  >({
    queryKey: ["ranking-point-rules"],
    queryFn: async () => {
      const res = await fetch("/api/ranking-point-rules");
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
    staleTime: 1000 * 60,
  });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MedalIcon className="h-5 w-5" />
            Ranking anual puntuable
          </CardTitle>
          <CardDescription>
            Puntos por torneos puntuables finalizados en el año en curso. La
            categoría es la del torneo; los puntos son individuales por jugador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={effectiveCategoryId != null ? String(effectiveCategoryId) : ""}
                onValueChange={(v) => setSelectedCategoryId(Number(v))}
                disabled={loadingCategories}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Elegir categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">Año {currentYear}</p>
          </div>

          {loadingRanking ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ranking && ranking.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead className="text-right">Puntos</TableHead>
                  <TableHead className="text-right">Torneos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.rows.map((row) => (
                  <TableRow key={row.player_id}>
                    <TableCell className="font-medium">{row.position}</TableCell>
                    <TableCell>
                      {row.first_name} {row.last_name}
                    </TableCell>
                    <TableCell className="text-right">{row.total_points}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.tournaments_played}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No hay puntos registrados para {categoryName} en {currentYear}.
              Finalizá torneos puntuables para que se carguen aquí.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit w-full xl:max-w-[320px] xl:justify-self-end">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2Icon className="h-4 w-4" />
            Puntos por ronda
          </CardTitle>
          <CardDescription className="text-xs">
            Puntos que se asignan por ronda al finalizar un torneo puntuable.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingRules ? (
            <div className="flex justify-center py-6">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Ronda</TableHead>
                  <TableHead className="h-8 w-24 text-right text-xs">Puntos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pointRules as TournamentRankingPointRule[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-1.5 text-sm">
                      {ROUND_LABELS[r.round_reached] ?? r.round_reached}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-sm font-medium">
                      {r.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
