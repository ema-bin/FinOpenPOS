"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2Icon, MessageCircleIcon, CopyIcon, ImageIcon } from "lucide-react";
import type { TournamentDTO } from "@/models/dto/tournament";
import {
  buildWhatsAppUrl,
  personalizeWhatsAppMessage,
} from "@/lib/whatsapp";
import { copyImageFromUrl } from "@/lib/copy-image-url";
import { toast } from "sonner";

type NotificationPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  category_label: string | null;
  has_phone: boolean;
  whatsapp_url: string | null;
};

type NotificationsResponse = {
  available: boolean;
  reason?: string;
  list_mode?: string;
  tournament_name: string;
  category_name: string | null;
  tournament_status?: string;
  default_message: string;
  flyer_url?: string;
  players: NotificationPlayer[];
  enrolled_count: number;
  unregistered_count: number;
};

async function fetchNotifications(
  tournamentId: number
): Promise<NotificationsResponse> {
  const res = await fetch(
    `/api/tournaments/${tournamentId}/registration-notifications`
  );
  if (!res.ok) throw new Error("No se pudo cargar la lista");
  return res.json();
}

export default function RegistrationNotificationsTab({
  tournament,
}: {
  tournament: Pick<
    TournamentDTO,
    | "id"
    | "name"
    | "status"
    | "category"
    | "category_id"
    | "is_suma_13_damas"
    | "registration_fee"
  >;
}) {
  const [messageTemplate, setMessageTemplate] = useState<string | null>(null);
  const [copyingFlyer, setCopyingFlyer] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tournament-registration-notifications", tournament.id],
    queryFn: () => fetchNotifications(tournament.id),
    staleTime: 1000 * 30,
  });

  const effectiveTemplate =
    messageTemplate ?? data?.default_message ?? "";
  const flyerUrl = data?.flyer_url ?? null;
  const hasFlyer = Boolean(flyerUrl);

  const playersWithLinks = useMemo(() => {
    if (!data?.players) return [];
    return data.players.map((p) => ({
      ...p,
      whatsapp_url: buildWhatsAppUrl(
        p.phone,
        personalizeWhatsAppMessage(effectiveTemplate, p)
      ),
    }));
  }, [data?.players, effectiveTemplate]);

  const handleCopyFlyer = async () => {
    if (!flyerUrl) {
      toast.error("Subí un flier en la pestaña Flier Promoción");
      return;
    }
    setCopyingFlyer(true);
    try {
      await copyImageFromUrl(flyerUrl);
      toast.success(
        "Flier copiado. En WhatsApp pegalo como imagen después de abrir el chat."
      );
    } catch {
      toast.error("No se pudo copiar el flier");
    } finally {
      setCopyingFlyer(false);
    }
  };

  const withPhoneCount = playersWithLinks.filter((p) => p.whatsapp_url).length;

  const listDescription = useMemo(() => {
    if (!data?.available) return null;
    if (data.list_mode === "suma_13_damas") {
      return "Jugadoras activas con categoría de damas que aún no están en ningún equipo de este torneo Suma 13.";
    }
    return `Jugadores activos con categoría ${data.category_name ?? ""} que no figuran en ningún equipo de este torneo.`;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No se pudo cargar las notificaciones.
      </p>
    );
  }

  if (!data.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones WhatsApp</CardTitle>
          <CardDescription>{data.reason}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const registrationOpen =
    tournament.status === "draft" || tournament.status === "schedule_review";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleIcon className="h-5 w-5" />
            Notificaciones WhatsApp
          </CardTitle>
          <CardDescription>
            {listDescription}{" "}
            {data.unregistered_count} sin inscribir · {data.enrolled_count}{" "}
            ya en equipos.
            {!registrationOpen && (
              <span className="block mt-1 text-amber-700 dark:text-amber-400">
                La inscripción está cerrada ({tournament.status}); podés igual
                contactar jugadores por si falta confirmar algo.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
            <Label>Flier (opcional)</Label>
            {!hasFlyer ? (
              <p className="text-xs text-muted-foreground">
                Subí el flier en <strong>Flier Promoción</strong> para poder
                copiarlo y pegarlo en WhatsApp.
              </p>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                <div className="shrink-0 rounded-md border overflow-hidden w-24 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={flyerUrl}
                    src={flyerUrl}
                    alt="Vista previa del flier"
                    className="w-full h-auto"
                  />
                </div>
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={handleCopyFlyer}
                    disabled={copyingFlyer}
                  >
                    {copyingFlyer ? (
                      <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4 mr-1" />
                    )}
                    Copiar imagen del flier
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Copiá el flier, abrí WhatsApp con Enviar y pegá la imagen en
                    el chat (el mensaje de texto va aparte).
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-message">Mensaje (se abre en WhatsApp)</Label>
            <Textarea
              id="wa-message"
              rows={5}
              value={effectiveTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Mensaje de invitación..."
            />
            <p className="text-xs text-muted-foreground">
              Placeholder: {"{nombre}"}. Un chat por jugador.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const sample = data.players[0];
                const text = sample
                  ? personalizeWhatsAppMessage(effectiveTemplate, sample)
                  : effectiveTemplate;
                navigator.clipboard.writeText(text);
                toast.success("Mensaje de ejemplo copiado");
              }}
            >
              <CopyIcon className="h-4 w-4 mr-1" />
              Copiar mensaje de ejemplo
            </Button>
          </div>

          {playersWithLinks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay jugadores pendientes de inscripción en esta categoría.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {withPhoneCount} con teléfono válido para WhatsApp de{" "}
                {playersWithLinks.length} en la lista.
              </p>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jugador</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="w-[140px] text-right">
                        WhatsApp
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playersWithLinks.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.first_name} {p.last_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {p.category_label ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {p.phone?.trim() ? p.phone : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.whatsapp_url ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <a
                                href={p.whatsapp_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <MessageCircleIcon className="h-4 w-4 mr-1" />
                                Enviar
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sin teléfono
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
