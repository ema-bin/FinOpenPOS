"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function shownImage(url: string, version?: string): string {
  if (!url || url.startsWith("blob:") || !version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function slideOf(form: typeof EMPTY, image: string): PlaybackSlide {
  return {
    id: 0,
    durationSeconds: 10,
    contentType: form.content_type,
    title: form.title,
    description: form.description,
    imageUrl: image,
    price: form.price === "" ? null : Number(form.price),
    highlight: form.highlight,
  };
}

export function PromotionsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageUrlRef = useRef("");
  const query = useQuery({
    queryKey: ["signage-promotions"],
    queryFn: () => signageApi<SignagePromotion[]>("/api/signage/promotions"),
  });

  function startNew() {
    setEditingId(null);
    setForm(EMPTY);
    imageUrlRef.current = "";
    setPreviewUrl(null);
    setOpen(true);
  }

  function edit(promo: SignagePromotion) {
    setEditingId(promo.id);
    setPreviewUrl(null);
    imageUrlRef.current = promo.imageUrl;
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
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: (body: typeof EMPTY & { id: number | null }) => {
      const payload = {
        ...body,
        image_url: body.image_url,
        price: body.price === "" ? null : Number(body.price),
        starts_on: body.starts_on || null,
        ends_on: body.ends_on || null,
      };
      return body.id
        ? signageApi(`/api/signage/promotions/${body.id}`, jsonInit("PATCH", payload))
        : signageApi("/api/signage/promotions", jsonInit("POST", payload));
    },
    onSuccess: async (_saved, body) => {
      const version = new Date().toISOString();
      queryClient.setQueryData<SignagePromotion[]>(["signage-promotions"], (rows) =>
        rows?.map((promo) => promo.id === body.id ? { ...promo, imageUrl: body.image_url, updatedAt: version } : promo)
      );
      toast.success(body.id ? "Promoción actualizada" : "Promoción creada");
      setOpen(false);
      setEditingId(null);
      setForm(EMPTY);
      imageUrlRef.current = "";
      setPreviewUrl(null);
      await queryClient.invalidateQueries({ queryKey: ["signage-promotions"] });
      await queryClient.invalidateQueries({ queryKey: ["signage-playlists"] });
      await queryClient.invalidateQueries({ queryKey: ["signage-screens"] });
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
    if (!file || uploading) return;
    setUploading(true);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await signageApi<{ url: string }>("/api/signage/upload", { method: "POST", body: formData });
      imageUrlRef.current = result.url;
      setPreviewUrl(null);
      setForm((current) => ({ ...current, image_url: result.url }));
      toast.success("Imagen lista");
    } catch (error) {
      fail(error);
    } finally {
      setUploading(false);
    }
  }

  const image = previewUrl || form.image_url;
  const rows = query.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button type="button" disabled={!canWrite} onClick={startNew}>Nueva promoción</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((promo) => (
          <article key={promo.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <button type="button" className="block w-full text-left" onClick={() => edit(promo)}>
              <div className="relative aspect-video bg-black">
                <img key={shownImage(promo.imageUrl, promo.updatedAt)} src={shownImage(promo.imageUrl, promo.updatedAt)} alt="" className={`h-full w-full object-contain ${promo.isActive ? "" : "opacity-40"}`} />
                {promo.price != null ? (
                  <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 text-sm font-semibold text-black">{money(promo.price)}</span>
                ) : null}
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                  {promo.isActive ? (promo.contentType === "promo_card" ? "Tarjeta" : "Imagen") : "Pausada"}
                </span>
              </div>
              <div className="p-3">
                <p className="font-medium">{promo.name}</p>
                <p className="truncate text-sm text-muted-foreground">{promo.title || "Sin título en pantalla"}</p>
              </div>
            </button>
            <div className="flex gap-2 px-3 pb-3">
              <Button type="button" size="sm" variant="outline" onClick={() => edit(promo)}>Editar</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(promo.id)}>Eliminar</Button>
            </div>
          </article>
        ))}
      </div>
      {query.isError ? <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "No se pudieron cargar las promociones"}</p> : null}
      {rows.length === 0 && !query.isLoading ? <p className="text-sm text-muted-foreground">Todavía no hay promociones. La primera va a aparecer acá como un cartel.</p> : null}

      <Dialog open={open} onOpenChange={(next) => { if (!uploading) setOpen(next); }}>
        <DialogContent
          className="max-h-[90vh] max-w-4xl overflow-y-auto"
          onEscapeKeyDown={(event) => { if (uploading) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (uploading) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4 md:grid-cols-[1fr_18rem]"
            onSubmit={(event) => {
              event.preventDefault();
              if (uploading) return;
              save.mutate({ ...form, image_url: imageUrlRef.current || form.image_url, id: editingId });
            }}
          >
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-name">Nombre interno</Label>
                  <Input id="promo-name" value={form.name} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-title">Título en pantalla</Label>
                  <Input id="promo-title" value={form.title} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="promo-description">Descripción</Label>
                  <Input id="promo-description" value={form.description} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-price">Precio</Label>
                  <Input id="promo-price" inputMode="decimal" value={form.price} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, price: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-highlight">Destacado</Label>
                  <Input id="promo-highlight" value={form.highlight} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, highlight: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-start">Desde</Label>
                  <Input id="promo-start" type="date" value={form.starts_on} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-end">Hasta</Label>
                  <Input id="promo-end" type="date" value={form.ends_on} disabled={!canWrite || uploading} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  Tipo
                  <select
                    className="rounded-md border bg-background px-2 py-1"
                    value={form.content_type}
                    disabled={!canWrite || uploading}
                    onChange={(event) => setForm({ ...form, content_type: event.target.value === "promo_card" ? "promo_card" : "full_image" })}
                  >
                    <option value="full_image">Imagen completa</option>
                    <option value="promo_card">Tarjeta con precio</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_active} disabled={!canWrite || uploading} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                  Activa
                </label>
                <label className="text-sm">
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canWrite || uploading} onChange={(event) => void onFile(event.target.files?.[0])} />
                  <span className={`inline-flex h-9 items-center rounded-md border px-3 ${uploading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>Subir imagen</span>
                </label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!canWrite || uploading || save.isPending}>{editingId ? "Guardar" : "Crear"}</Button>
                <Button type="button" variant="outline" disabled={uploading} onClick={() => setOpen(false)}>Cancelar</Button>
              </div>
            </div>
            <div className="grid content-start gap-2">
              <p className="text-sm text-muted-foreground">Así se ve en el televisor</p>
              {image ? (
                <SignagePlayer key={image} mode="preview" items={[slideOf(form, image)]} transition="cut" fallback={{ name: form.name || "Vista previa", logoUrl: null }} />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-md bg-black text-sm text-white">Subí una imagen</div>
              )}
            </div>
          </form>
          {uploading ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
              <p className="text-sm font-medium">Subiendo imagen…</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
