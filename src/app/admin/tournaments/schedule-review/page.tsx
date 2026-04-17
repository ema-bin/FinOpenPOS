"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, ExternalLinkIcon, CalendarCogIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TournamentDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import ScheduleReviewTab from "../[id]/ScheduleReviewTab";

type ReviewTournament = Pick<TournamentDTO, "id" | "name" | "match_duration" | "status">;

export default function GlobalScheduleReviewPage() {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<Array<{ message: string; timestamp: Date }>>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery<ReviewTournament[]>({
    queryKey: ["tournaments", "global-schedule-review"],
    queryFn: async () => {
      const tournaments = await tournamentsService.getAll(["schedule_review"]);
      return tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        match_duration: tournament.match_duration,
        status: tournament.status,
      }));
    },
    staleTime: 1000 * 30,
  });

  const handleGlobalRegenerate = async () => {
    setGlobalError(null);
    setIsProcessing(true);
    setProgress(0);
    setStatus("Iniciando...");
    setLogs([]);

    try {
      const response = await fetch("/api/tournaments/schedule-review/regenerate-stream", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "No se pudo iniciar la generación global.");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No se pudo leer la respuesta del servidor.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === "log") {
            setLogs((prev) => [...prev, { message: payload.message, timestamp: new Date() }]);
          } else if (payload.type === "progress") {
            setProgress(payload.progress ?? 0);
            setStatus(payload.status ?? "");
          } else if (payload.type === "error") {
            throw new Error(payload.error || "Error en generación global.");
          } else if (payload.type === "success") {
            setLogs((prev) => [
              ...prev,
              { message: "✅ Generación global finalizada.", timestamp: new Date() },
            ]);
            setProgress(100);
            setStatus("Completado");
          }
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ["tournaments", "global-schedule-review"],
      });
      await queryClient.invalidateQueries({ queryKey: ["tournament-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setGlobalError(message);
      setLogs((prev) => [...prev, { message: `❌ ${message}`, timestamp: new Date() }]);
    } finally {
      setIsProcessing(false);
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[240px] flex items-center justify-center">
        <Loader2Icon className="h-7 w-7 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Revisión global de horarios</CardTitle>
          <CardDescription>
            No se pudieron cargar los torneos en revisión de horarios.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tournaments = data ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-none p-0">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Revisión global de horarios</CardTitle>
          <CardDescription>
            Gestioná desde un solo lugar todos los torneos que están en revisión de horarios.
          </CardDescription>
          <div className="flex items-center gap-2 pt-3">
            <Button onClick={handleGlobalRegenerate} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <CalendarCogIcon className="h-4 w-4 mr-2" />
                  Generar horarios en conjunto
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {(isProcessing || logs.length > 0 || globalError) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bitácora generación global</CardTitle>
            {status && (
              <CardDescription>
                {status} ({progress}%)
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {globalError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                {globalError}
              </div>
            )}
            <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 space-y-1 text-xs font-mono">
              {logs.length === 0 ? (
                <div className="text-muted-foreground">Esperando logs...</div>
              ) : (
                logs.map((entry, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-muted-foreground">
                      {entry.timestamp.toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span>{entry.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay torneos en estado de revisión de horarios.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {tournaments.map((tournament) => (
            <Card key={tournament.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{tournament.name}</CardTitle>
                    <CardDescription>
                      Torneo #{tournament.id}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/tournaments/${tournament.id}`}>
                      Abrir torneo
                      <ExternalLinkIcon className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScheduleReviewTab tournament={tournament} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
