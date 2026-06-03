"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { tournamentsService } from "@/services";
import {
  buildWhatsAppUrl,
  defaultWhatsAppLinkTarget,
  personalizeWhatsAppMessage,
} from "@/lib/whatsapp";
import {
  CopyImageError,
  copyImageFromUrl,
  downloadImageFromUrl,
} from "@/lib/copy-image-url";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type NotificationPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  category_label: string | null;
  has_phone: boolean;
  is_notified: boolean;
  notified_at: string | null;
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
  notified_count?: number;
  pending_notification_count?: number;
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
  const queryClient = useQueryClient();
  const [messageTemplate, setMessageTemplate] = useState<string | null>(null);
  const [copyingFlyer, setCopyingFlyer] = useState(false);
  const [hideNotified, setHideNotified] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tournament-registration-notifications", tournament.id],
    queryFn: () => fetchNotifications(tournament.id),
    staleTime: 1000 * 30,
  });

  const markMutation = useMutation({
    mutationFn: ({
      playerId,
      notified,
    }: {
      playerId: number;
      notified: boolean;
    }) =>
      tournamentsService.setRegistrationNotified(
        tournament.id,
        playerId,
        notified
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tournament-registration-notifications", tournament.id],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const effectiveTemplate =
    messageTemplate ?? data?.default_message ?? "";
  const flyerUrl = data?.flyer_url ?? undefined;
  const hasFlyer = Boolean(flyerUrl);

  const linkTarget = defaultWhatsAppLinkTarget();

  const playersWithLinks = useMemo(() => {
    if (!data?.players) return [];
    return data.players.map((p) => ({
      ...p,
      whatsapp_url: buildWhatsAppUrl(
        p.phone,
        personalizeWhatsAppMessage(effectiveTemplate, p, {
          categoryName: data.category_name,
        }),
        linkTarget
      ),
    }));
  }, [data?.players, data?.category_name, effectiveTemplate, linkTarget]);

  const visiblePlayers = useMemo(
    () =>
      hideNotified
        ? playersWithLinks.filter((p) => !p.is_notified)
        : playersWithLinks,
    [playersWithLinks, hideNotified]
  );

  const handleCopyFlyer = async () => {
    if (!flyerUrl) {
      toast.error("Subí un flier en la pestaña Flier Promoción");
      return;
    }
    setCopyingFlyer(true);
    const proxyUrl = `/api/tournaments/${tournament.id}/promo-flyer/blob`;
    try {
      await copyImageFromUrl(flyerUrl, { fetchUrl: proxyUrl });
      toast.success(
        "Flier copiado. En WhatsApp pegalo como imagen después de abrir el chat."
      );
    } catch (err) {
      console.error("copy flyer:", err);
      try {
        await downloadImageFromUrl(flyerUrl, `flier-${tournament.name}.png`, {
          fetchUrl: proxyUrl,
        });
        toast.message(
          err instanceof CopyImageError && err.code === "clipboard"
            ? "No se pudo copiar al portapapeles; se descargó el flier."
            : "Se descargó el flier (la copia directa falló).",
          { description: "Subilo manualmente a WhatsApp o pegá si tu navegador lo permite." }
        );
      } catch {
        toast.error(
          err instanceof CopyImageError
            ? err.message
            : "No se pudo copiar el flier"
        );
      }
    } finally {
      setCopyingFlyer(false);
    }
  };

  const toggleNotified = (playerId: number, notified: boolean) => {
    markMutation.mutate({ playerId, notified });
  };

  const withPhoneCount = visiblePlayers.filter((p) => p.whatsapp_url).length;

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
  const notifiedCount = data.notified_count ?? 0;
  const pendingCount =
    data.pending_notification_count ??
    data.unregistered_count - notifiedCount;

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
            {pendingCount} pendientes · {notifiedCount} notificados ·{" "}
            {data.enrolled_count} ya inscriptos.
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
              Placeholders: {"{nombre}"}, {"{categoria}"}. Enviar abre WhatsApp
              Desktop y marca al jugador como notificado.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const sample = data.players[0];
                const text = sample
                  ? personalizeWhatsAppMessage(effectiveTemplate, sample, {
                      categoryName: data.category_name,
                    })
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {withPhoneCount} con teléfono en esta vista ·{" "}
                  {visiblePlayers.length} jugador
                  {visiblePlayers.length === 1 ? "" : "es"} mostrados
                </p>
                <div className="flex items-center gap-2">
                  <Switch
                    id="hide-notified"
                    checked={hideNotified}
                    onCheckedChange={setHideNotified}
                  />
                  <Label htmlFor="hide-notified" className="text-sm font-normal">
                    Ocultar notificados
                  </Label>
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">OK</TableHead>
                      <TableHead>Jugador</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="w-[140px] text-right">
                        WhatsApp
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePlayers.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          Todos los jugadores visibles ya fueron notificados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visiblePlayers.map((p) => (
                        <TableRow
                          key={p.id}
                          className={cn(
                            p.is_notified && "bg-muted/40 text-muted-foreground"
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={p.is_notified}
                              disabled={markMutation.isPending}
                              onCheckedChange={(checked) =>
                                toggleNotified(p.id, checked === true)
                              }
                              aria-label={`Notificado: ${p.first_name} ${p.last_name}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {p.first_name} {p.last_name}
                            {p.is_notified && p.notified_at && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                Notificado
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
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
                                  onClick={() => {
                                    if (!p.is_notified) {
                                      toggleNotified(p.id, true);
                                    }
                                  }}
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
                      ))
                    )}
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
