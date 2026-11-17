"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { promotionIsLive } from "@/lib/signage/resolve";
import { jsonInit, signageApi } from "@/components/signage/api";
import { SignagePlayer } from "@/components/signage/player";
import type { PlaybackSlide, SignagePlaylist, SignageScreen } from "@/components/signage/types";

const SOURCE: Record<SignageScreen["now"]["source"], string> = {
  override: "Reproducción manual",
  schedule: "Programación",
  default: "Lista de respaldo",
  fallback: "Ficha del club",
};

function fail(error: unknown) {
  toast.error(error instanceof Error ? error.message : "No se pudo guardar");
}

export function ScreensTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [defaultPlaylistId, setDefaultPlaylistId] = useState("");
  const [active, setActive] = useState(true);
  const [manual, setManual] = useState<Record<number, { playlistId: string; minutes: string }>>({});
  const screens = useQuery({ queryKey: ["signage-screens"], queryFn: () => signageApi<SignageScreen[]>("/api/signage/screens") });
  const lists = useQuery({ queryKey: ["signage-playlists"], queryFn: () => signageApi<SignagePlaylist[]>("/api/signage/playlists") });

  const create = useMutation({
    mutationFn: () => signageApi("/api/signage/screens", jsonInit("POST", {
      name,
      location,
      is_active: active,
      default_playlist_id: defaultPlaylistId || null,
    })),
    onSuccess: async () => {
      toast.success("Pantalla creada");
      setName("");
      setLocation("");
      await queryClient.invalidateQueries({ queryKey: ["signage-screens"] });
    },
    onError: fail,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown> & { id: number }) => signageApi(`/api/signage/screens/${body.id}`, jsonInit("PATCH", body)),
    onSuccess: async () => {
      toast.success("Pantalla actualizada");
      await queryClient.invalidateQueries({ queryKey: ["signage-screens"] });
    },
    onError: fail,
  });

  const forcePlay = useMutation({
    mutationFn: ({ id, playlistId, minutes }: { id: number; playlistId: string; minutes: string }) =>
      signageApi(`/api/signage/screens/${id}/override`, jsonInit("POST", { playlist_id: Number(playlistId), minutes: minutes === "" ? null : Number(minutes) })),
    onSuccess: async () => {
      toast.success("La pantalla está pasando esa lista");
      await queryClient.invalidateQueries({ queryKey: ["signage-screens"] });
    },
    onError: fail,
  });

  const stopManual = useMutation({
    mutationFn: (id: number) => signageApi(`/api/signage/screens/${id}/override`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Volvió a la programación");
      await queryClient.invalidateQueries({ queryKey: ["signage-screens"] });
    },
    onError: fail,
  });

  return (
    <div className="grid gap-6">
      <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <div className="grid gap-1.5">
          <Label htmlFor="screen-name">Nombre</Label>
          <Input id="screen-name" value={name} disabled={!canWrite} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="screen-location">Lugar</Label>
          <Input id="screen-location" value={location} disabled={!canWrite} placeholder="Cantina" onChange={(event) => setLocation(event.target.value)} />
        </div>
        <label className="grid gap-1.5 text-sm">
          Lista de respaldo
          <select className="h-9 rounded-md border bg-background px-2" value={defaultPlaylistId} disabled={!canWrite} onChange={(event) => setDefaultPlaylistId(event.target.value)}>
            <option value="">Sin lista</option>
            {(lists.data ?? []).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} disabled={!canWrite} onCheckedChange={setActive} />
          Activa
        </label>
        <Button type="submit" disabled={!canWrite || create.isPending}>Crear pantalla</Button>
      </form>

      <div className="grid gap-4">
        {(screens.data ?? []).map((screen) => {
          const choice = manual[screen.id] ?? { playlistId: "", minutes: "" };
          const playlist = (lists.data ?? []).find((list) => list.id === screen.now.playlistId) ?? null;
          const slides: PlaybackSlide[] = (playlist?.items ?? []).flatMap((item) => {
            const promo = item.promotion;
            if (!promo || !promotionIsLive(promo, screen.today)) return [];
            return [{
              id: item.id,
              durationSeconds: item.durationSeconds,
              contentType: promo.contentType,
              title: promo.title,
              description: promo.description,
              imageUrl: promo.imageUrl,
              price: promo.price,
              highlight: promo.highlight,
            }];
          });
          return (
            <article key={screen.id} className="grid gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{screen.name}</p>
                  <p className="text-sm text-muted-foreground">{screen.location || "Sin lugar"} · {screen.isActive ? "Activa" : "Pausada"}</p>
                  <p className="text-sm">Ahora: {SOURCE[screen.now.source]}{screen.now.playlistName ? ` · ${screen.now.playlistName}` : ""}</p>
                  <p className="text-sm text-muted-foreground">
                    Último contacto: {screen.lastSeenAt ? new Date(screen.lastSeenAt).toLocaleString("es-AR") : "todavía no se conectó"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(screen.playbackUrl).then(() => toast.success("Link copiado"))}
                >
                  Copiar link
                </Button>
              </div>
              <p className="break-all text-sm">{screen.playbackUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => patch.mutate({ id: screen.id, rotate_token: true })}>
                  Nuevo link
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!canWrite || screen.now.source !== "override"} onClick={() => stopManual.mutate(screen.id)}>
                  Terminar manual
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-sm">
                  Forzar lista
                  <select className="h-9 rounded-md border bg-background px-2" value={choice.playlistId} disabled={!canWrite} onChange={(event) => setManual({ ...manual, [screen.id]: { ...choice, playlistId: event.target.value } })}>
                    <option value="">Elegí una lista</option>
                    {(lists.data ?? []).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Minutos
                  <Input className="w-28" inputMode="numeric" placeholder="Hasta cortar" value={choice.minutes} disabled={!canWrite} onChange={(event) => setManual({ ...manual, [screen.id]: { ...choice, minutes: event.target.value } })} />
                </label>
                <Button type="button" disabled={!canWrite || !choice.playlistId} onClick={() => forcePlay.mutate({ id: screen.id, playlistId: choice.playlistId, minutes: choice.minutes })}>
                  Reproducir ahora
                </Button>
              </div>
              <div className="max-w-xl">
                <SignagePlayer mode="preview" items={slides} transition={playlist?.transition === "cut" ? "cut" : "fade"} fallback={{ name: screen.name, logoUrl: null }} />
              </div>
            </article>
          );
        })}
      </div>
      {screens.isError ? <p className="text-sm text-destructive">{screens.error instanceof Error ? screens.error.message : "No se pudieron cargar las pantallas"}</p> : null}
    </div>
  );
}
