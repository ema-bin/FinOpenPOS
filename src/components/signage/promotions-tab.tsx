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
import type { PlaybackSlide, SignagePromotion } from "@/components/signage/types";

const EMPTY = {
  name: "",
  title: "",
  description: "",
  image_url: "",
  price: "",
  highlight: "",
  starts_on: "",
  ends_on: "",
  is_active: true,
  content_type: "full_image" as "full_image" | "promo_card",
};

function fail(error: unknown) {
  toast.error(error instanceof Error ? error.message : "No se pudo guardar");
}

function slideOf(form: typeof EMPTY): PlaybackSlide {
  return {
    id: 0,
    durationSeconds: 10,
    contentType: form.content_type,
    title: form.title,
    description: form.description,
    imageUrl: form.image_url,
    price: form.price === "" ? null : Number(form.price),
    highlight: form.highlight,
  };
}

export function PromotionsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["signage-promotions"],
    queryFn: () => signageApi<SignagePromotion[]>("/api/signage/promotions"),
  });

  function edit(promo: SignagePromotion) {
    setEditingId(promo.id);
    setPreviewUrl(null);
    setForm({
      name: promo.name,
      title: promo.title,
      description: promo.description,
      image_url: promo.imageUrl,
      price: promo.price == null ? "" : String(promo.price),
      highlight: promo.highlight,
      starts_on: promo.startsOn ?? "",
      ends_on: promo.endsOn ?? "",
      is_active: promo.isActive,
      content_type: promo.contentType,
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, price: form.price === "" ? null : Number(form.price), starts_on: form.starts_on || null, ends_on: form.ends_on || null };
      return editingId
        ? signageApi(`/api/signage/promotions/${editingId}`, jsonInit("PATCH", body))
        : signageApi("/api/signage/promotions", jsonInit("POST", body));
    },
    onSuccess: async () => {
      toast.success(editingId ? "Promoción actualizada" : "Promoción creada");
      setEditingId(null);
      setForm(EMPTY);
      setPreviewUrl(null);
      await queryClient.invalidateQueries({ queryKey: ["signage-promotions"] });
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => signageApi(`/api/signage/promotions/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Promoción eliminada");
      await queryClient.invalidateQueries({ queryKey: ["signage-promotions"] });
    },
    onError: fail,
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await signageApi<{ url: string }>("/api/signage/upload", { method: "POST", body: formData });
      setForm((current) => ({ ...current, image_url: result.url }));
      toast.success("Imagen lista");
    } catch (error) {
      fail(error);
    }
  }

  const image = previewUrl || form.image_url;
  const rows = query.data ?? [];

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="promo-name">Nombre interno</Label>
            <Input id="promo-name" value={form.name} disabled={!canWrite} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="promo-title">Título en pantalla</Label>
            <Input id="promo-title" value={form.title} disabled={!canWrite} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="promo-description">Descripción</Label>
            <Input id="promo-description" value={form.description} disabled={!canWrite} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="promo-price">Precio</Label>
            <Input id="promo-price" inputMode="decimal" value={form.price} disabled={!canWrite} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="promo-highlight">Destacado</Label>
            <Input id="promo-highlight" value={form.highlight} disabled={!canWrite} onChange={(event) => setForm({ ...form, highlight: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="promo-start">Desde</Label>
            <Input id="promo-start" type="date" value={form.starts_on} disabled={!canWrite} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="promo-end">Hasta</Label>
            <Input id="promo-end" type="date" value={form.ends_on} disabled={!canWrite} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            Tipo
            <select
              className="rounded-md border bg-background px-2 py-1"
              value={form.content_type}
              disabled={!canWrite}
              onChange={(event) => setForm({ ...form, content_type: event.target.value === "promo_card" ? "promo_card" : "full_image" })}
            >
              <option value="full_image">Imagen completa</option>
              <option value="promo_card">Tarjeta con precio</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_active} disabled={!canWrite} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            Activa
          </label>
          <label className="text-sm">
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canWrite} onChange={(event) => void onFile(event.target.files?.[0])} />
            <span className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3">Subir imagen</span>
          </label>
        </div>
        {image ? (
          <div className="max-w-xl">
            <SignagePlayer mode="preview" items={form.image_url || previewUrl ? [slideOf({ ...form, image_url: image })] : []} transition="cut" fallback={{ name: "Vista previa", logoUrl: null }} />
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={!canWrite || save.isPending}>{editingId ? "Guardar" : "Crear"}</Button>
          {editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY); setPreviewUrl(null); }}>Cancelar</Button> : null}
        </div>
      </form>

      <div className="grid gap-3 md:hidden">
        {rows.map((promo) => (
          <article key={promo.id} className="rounded-lg border p-3">
            <p className="font-medium">{promo.name}</p>
            <p className="text-sm text-muted-foreground">{promo.isActive ? "Activa" : "Pausada"} · {promo.contentType === "promo_card" ? "Tarjeta" : "Imagen"}</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => edit(promo)}>Editar</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(promo.id)}>Eliminar</Button>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-2">Nombre</th><th>Título</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((promo) => (
              <tr key={promo.id} className="border-t">
                <td className="py-2">{promo.name}</td>
                <td>{promo.title || "—"}</td>
                <td>{promo.isActive ? "Activa" : "Pausada"}</td>
                <td className="space-x-2 text-right">
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(promo)}>Editar</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(promo.id)}>Eliminar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.isError ? <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "No se pudieron cargar las promociones"}</p> : null}
      {rows.length === 0 && !query.isLoading ? <p className="text-sm text-muted-foreground">Todavía no hay promociones.</p> : null}
    </div>
  );
}
