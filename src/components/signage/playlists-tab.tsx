"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { jsonInit, signageApi } from "@/components/signage/api";
import { SignagePlayer } from "@/components/signage/player";
import type { PlaybackSlide, SignagePlaylist, SignagePromotion } from "@/components/signage/types";

type DraftItem = { promotionId: number; durationSeconds: number };

function fail(error: unknown) {
  toast.error(error instanceof Error ? error.message : "No se pudo guardar");
}

export function PlaylistsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transition, setTransition] = useState<"fade" | "cut">("fade");
  const [active, setActive] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [adding, setAdding] = useState("");
  const lists = useQuery({ queryKey: ["signage-playlists"], queryFn: () => signageApi<SignagePlaylist[]>("/api/signage/playlists") });
  const promotions = useQuery({ queryKey: ["signage-promotions"], queryFn: () => signageApi<SignagePromotion[]>("/api/signage/promotions") });

  const save = useMutation({
    mutationFn: () => signageApi("/api/signage/playlists", jsonInit("POST", { name, description, transition, is_active: active })),
    onSuccess: async () => {
      toast.success("Lista creada");
      setName("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
    },
    onError: fail,
  });

  const duplicate = useMutation({
    mutationFn: (list: SignagePlaylist) => signageApi("/api/signage/playlists", jsonInit("POST", { duplicate_of: list.id, name: `${list.name} copia` })),
    onSuccess: async () => {
      toast.success("Lista duplicada");
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => signageApi(`/api/signage/playlists/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Lista eliminada");
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
    },
    onError: fail,
  });

  const saveItems = useMutation({
    mutationFn: () => signageApi(`/api/signage/playlists/${openId}/items`, jsonInit("PUT", { items: draft })),
    onSuccess: async () => {
      toast.success("Orden guardado");
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
    },
    onError: fail,
  });

  function open(list: SignagePlaylist) {
    setOpenId(list.id);
    setDraft(list.items.map((item) => ({ promotionId: item.promotionId, durationSeconds: item.durationSeconds })));
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= draft.length) return;
    const copy = [...draft];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    setDraft(copy);
  }

  const openList = (lists.data ?? []).find((list) => list.id === openId) ?? null;
  const preview: PlaybackSlide[] = draft.flatMap((item, index) => {
    const promo = (promotions.data ?? []).find((candidate) => candidate.id === item.promotionId);
    if (!promo) return [];
    return [{
      id: index + 1,
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
    <div className="grid gap-6">
      <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div className="grid gap-1.5">
          <Label htmlFor="list-name">Nombre</Label>
          <Input id="list-name" value={name} disabled={!canWrite} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="list-description">Descripción</Label>
          <Input id="list-description" value={description} disabled={!canWrite} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          Transición
          <select className="rounded-md border bg-background px-2 py-1" value={transition} disabled={!canWrite} onChange={(event) => setTransition(event.target.value === "cut" ? "cut" : "fade")}>
            <option value="fade">Fundido</option>
            <option value="cut">Corte</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} disabled={!canWrite} onCheckedChange={setActive} />
          Activa
        </label>
        <Button type="submit" disabled={!canWrite || save.isPending}>Crear lista</Button>
      </form>

      <div className="grid gap-3">
        {(lists.data ?? []).map((list) => (
          <article key={list.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{list.name}</p>
                <p className="text-sm text-muted-foreground">{list.items.length} promociones · {list.isActive ? "Activa" : "Pausada"} · {list.transition === "cut" ? "Corte" : "Fundido"}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => open(list)}>Editar orden</Button>
                <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => duplicate.mutate(list)}>Duplicar</Button>
                <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(list.id)}>Eliminar</Button>
              </div>
            </div>
            {openId === list.id ? (
              <div className="mt-3 grid gap-2">
                {draft.map((item, index) => {
                  const promo = (promotions.data ?? []).find((candidate) => candidate.id === item.promotionId);
                  return (
                    <div key={`${item.promotionId}-${index}`} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-40 flex-1 text-sm">{promo?.name ?? "Promoción"}</span>
                      <Input
                        className="w-24"
                        inputMode="numeric"
                        value={item.durationSeconds}
                        disabled={!canWrite}
                        onChange={(event) => setDraft(draft.map((current, currentIndex) => currentIndex === index ? { ...current, durationSeconds: Number(event.target.value) } : current))}
                      />
                      <span className="text-xs text-muted-foreground">seg</span>
                      <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => move(index, -1)}>Subir</Button>
                      <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => move(index, 1)}>Bajar</Button>
                      <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => setDraft(draft.filter((_, currentIndex) => currentIndex !== index))}>Quitar</Button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  <select className="rounded-md border bg-background px-2 py-1 text-sm" value={adding} disabled={!canWrite} onChange={(event) => setAdding(event.target.value)}>
                    <option value="">Agregar promoción</option>
                    {(promotions.data ?? []).map((promo) => <option key={promo.id} value={promo.id}>{promo.name}</option>)}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canWrite || !adding}
                    onClick={() => {
                      setDraft([...draft, { promotionId: Number(adding), durationSeconds: 10 }]);
                      setAdding("");
                    }}
                  >
                    Agregar
                  </Button>
                  <Button type="button" size="sm" disabled={!canWrite || saveItems.isPending} onClick={() => saveItems.mutate()}>Guardar orden</Button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {openList ? (
        <div className="max-w-xl">
          <p className="mb-2 text-sm text-muted-foreground">Vista previa de {openList.name}</p>
          <SignagePlayer mode="preview" items={preview} transition={openList.transition} fallback={{ name: openList.name, logoUrl: null }} />
        </div>
      ) : null}
      {lists.isError ? <p className="text-sm text-destructive">{lists.error instanceof Error ? lists.error.message : "No se pudieron cargar las listas"}</p> : null}
    </div>
  );
}
