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

function promoOf(promotions: SignagePromotion[], id: number) {
  return promotions.find((promo) => promo.id === id) ?? null;
}

export function PlaylistsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const lists = useQuery({ queryKey: ["signage-playlists"], queryFn: () => signageApi<SignagePlaylist[]>("/api/signage/playlists") });
  const promotions = useQuery({ queryKey: ["signage-promotions"], queryFn: () => signageApi<SignagePromotion[]>("/api/signage/promotions") });
  const catalog = promotions.data ?? [];

  const save = useMutation({
    mutationFn: () => signageApi("/api/signage/playlists", jsonInit("POST", { name, is_active: true, transition: "fade" })),
    onSuccess: async () => {
      toast.success("Lista creada");
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (list: SignagePlaylist) => signageApi(`/api/signage/playlists/${list.id}`, jsonInit("PATCH", {
      name: list.name,
      description: list.description,
      transition: list.transition,
      is_active: list.isActive,
    })),
    onSuccess: async () => {
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
    onSuccess: async (_data, id) => {
      toast.success("Lista eliminada");
      if (openId === id) setOpenId(null);
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
    if (openId === list.id) {
      setOpenId(null);
      return;
    }
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
    const promo = promoOf(catalog, item.promotionId);
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
  const available = catalog.filter((promo) => !draft.some((item) => item.promotionId === promo.id));

  return (
    <div className="grid gap-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="list-name">Nueva lista</Label>
          <Input id="list-name" value={name} placeholder="Almuerzo, noche, torneo…" disabled={!canWrite} onChange={(event) => setName(event.target.value)} />
        </div>
        <Button type="submit" disabled={!canWrite || save.isPending || !name.trim()}>Crear</Button>
      </form>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(lists.data ?? []).map((list) => (
          <article key={list.id} className={`overflow-hidden rounded-xl border bg-card shadow-sm ${openId === list.id ? "ring-2 ring-primary" : ""}`}>
            <button type="button" className="block w-full p-3 text-left" onClick={() => open(list)}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{list.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {list.items.length} {list.items.length === 1 ? "cartel" : "carteles"} · {list.isActive ? "Activa" : "Pausada"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {list.items.length === 0 ? (
                  <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">Sin carteles</div>
                ) : list.items.map((item) => (
                  <div key={item.id} className="relative w-36 shrink-0">
                    <div className="aspect-video overflow-hidden rounded-md bg-black">
                      {item.promotion?.imageUrl ? <img src={item.promotion.imageUrl} alt="" className="h-full w-full object-contain" /> : null}
                    </div>
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 text-xs text-white">{item.durationSeconds}s</span>
                  </div>
                ))}
              </div>
            </button>
            <div className="flex gap-2 px-3 pb-3">
              <Button type="button" size="sm" variant="outline" onClick={() => open(list)}>{openId === list.id ? "Cerrar" : "Armar"}</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => duplicate.mutate(list)}>Duplicar</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(list.id)}>Eliminar</Button>
            </div>
          </article>
        ))}
      </div>

      {openList ? (
        <section className="grid gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">{openList.name}</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                Transición
                <select
                  className="rounded-md border bg-background px-2 py-1"
                  value={openList.transition}
                  disabled={!canWrite}
                  onChange={(event) => update.mutate({ ...openList, transition: event.target.value === "cut" ? "cut" : "fade" })}
                >
                  <option value="fade">Fundido</option>
                  <option value="cut">Corte</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={openList.isActive} disabled={!canWrite} onCheckedChange={(checked) => update.mutate({ ...openList, isActive: checked })} />
                Activa
              </label>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {draft.map((item, index) => {
              const promo = promoOf(catalog, item.promotionId);
              return (
                <div key={`${item.promotionId}-${index}`} className="w-44 shrink-0 rounded-lg border p-2">
                  <div className="relative aspect-video overflow-hidden rounded-md bg-black">
                    {promo?.imageUrl ? <img src={promo.imageUrl} alt="" className="h-full w-full object-contain" /> : null}
                    <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 text-xs text-white">{index + 1}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">{promo?.name ?? "Promoción"}</p>
                  <label className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Input
                      className="h-8 w-16"
                      inputMode="numeric"
                      value={item.durationSeconds}
                      disabled={!canWrite}
                      onChange={(event) => setDraft(draft.map((current, currentIndex) => currentIndex === index ? { ...current, durationSeconds: Number(event.target.value) } : current))}
                    />
                    seg
                  </label>
                  <div className="mt-2 flex gap-1">
                    <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => move(index, -1)}>←</Button>
                    <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => move(index, 1)}>→</Button>
                    <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => setDraft(draft.filter((_, currentIndex) => currentIndex !== index))}>Quitar</Button>
                  </div>
                </div>
              );
            })}
          </div>

          {available.length > 0 ? (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Tocá un cartel para sumarlo. Entra al final, 10 segundos.</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {available.map((promo) => (
                  <button
                    key={promo.id}
                    type="button"
                    disabled={!canWrite}
                    className="w-28 shrink-0 text-left disabled:opacity-50"
                    onClick={() => setDraft([...draft, { promotionId: promo.id, durationSeconds: 10 }])}
                  >
                    <div className="aspect-video overflow-hidden rounded-md bg-black ring-1 ring-border">
                      <img src={promo.imageUrl} alt="" className="h-full w-full object-contain" />
                    </div>
                    <p className="mt-1 truncate text-xs">{promo.name}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-start gap-4">
            <Button type="button" disabled={!canWrite || saveItems.isPending} onClick={() => saveItems.mutate()}>Guardar orden</Button>
            <div className="w-full max-w-md">
              <SignagePlayer mode="preview" items={preview} transition={openList.transition} fallback={{ name: openList.name, logoUrl: null }} />
            </div>
          </div>
        </section>
      ) : null}
      {lists.isError ? <p className="text-sm text-destructive">{lists.error instanceof Error ? lists.error.message : "No se pudieron cargar las listas"}</p> : null}
    </div>
  );
}
