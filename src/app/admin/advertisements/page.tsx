"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FilePenIcon,
  TrashIcon,
  RotateCcwIcon,
  Loader2Icon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { advertisementsService } from "@/services/advertisements.service";
import type { AdvertisementDTO } from "@/models/dto/advertisement";

type FormState = {
  id?: number;
  name: string;
  image_url: string;
  target_url: string;
  description: string;
  ordering: number;
  is_active: boolean;
};

const ADS_BUCKET_URL =
  process.env.NEXT_PUBLIC_ADS_BUCKET_URL ??
  "https://supabase.com/dashboard/project/wzwdmxpifdaihvvuhmwz/storage/files/buckets/advertisements";

type AdvertisementFilterOption = "active" | "inactive" | "all";

export default function AdvertisementsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<AdvertisementFilterOption>("active");

  const { data: ads = [], isLoading, refetch } = useQuery({
    queryKey: ["advertisements", statusFilter],
    queryFn: () => advertisementsService.getAll(statusFilter),
    staleTime: 1000 * 60 * 5,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    image_url: "",
    target_url: "",
    description: "",
    ordering: ads.length + 1,
    is_active: true,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetImageSelection = useCallback(() => {
    setPendingImageFile(null);
    setPendingImagePreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const openDialog = (ad?: AdvertisementDTO) => {
    resetImageSelection();
    if (ad) {
      setFormState({
        id: ad.id,
        name: ad.name,
        image_url: ad.image_url,
        target_url: ad.target_url ?? "",
        description: ad.description ?? "",
        ordering: ad.ordering,
        is_active: ad.is_active,
      });
      setSelectedId(ad.id);
    } else {
      setFormState({
        name: "",
        image_url: "",
        target_url: "",
        description: "",
        ordering: ads.length + 1,
        is_active: true,
      });
      setSelectedId(null);
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    resetImageSelection();
    setIsDialogOpen(false);
    setSelectedId(null);
  };

  const mutateCreate = useMutation({
    mutationFn: (payload: Omit<FormState, "id">) => advertisementsService.create(payload),
    onSuccess: () => {
      toast.success("Publicidad creada");
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const mutateUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<FormState> }) =>
      advertisementsService.update(id, payload),
    onSuccess: () => {
      toast.success("Publicidad actualizada");
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutateDeactivate = useMutation({
    mutationFn: (id: number) => advertisementsService.deactivate(id),
    onSuccess: () => {
      toast.success("Publicidad desactivada");
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutateReactivate = useMutation({
    mutationFn: (id: number) => advertisementsService.update(id, { is_active: true }),
    onSuccess: () => {
      toast.success("Publicidad reactivada");
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadPendingImage = useCallback(async (): Promise<string> => {
    if (!pendingImageFile) {
      return formState.image_url.trim();
    }
    const formData = new FormData();
    formData.append("file", pendingImageFile);
    const res = await fetch("/api/advertisements/upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error uploading image" }));
      throw new Error(err.error || "Error uploading image");
    }
    const { url } = await res.json();
    return url;
  }, [pendingImageFile, formState.image_url]);

  const handleSubmit = useCallback(async () => {
    if (!formState.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!formState.image_url.trim() && !pendingImageFile) {
      toast.error("Elegí una imagen para la publicidad.");
      return;
    }

    setIsSubmitting(true);
    try {
      let imageUrl = formState.image_url.trim();
      if (pendingImageFile) {
        imageUrl = await uploadPendingImage();
      }

      const payload = {
        name: formState.name.trim(),
        image_url: imageUrl,
        target_url: formState.target_url.trim() || null,
        description: formState.description.trim() || null,
        ordering: formState.ordering,
        is_active: formState.is_active,
      };

      if (selectedId) {
        await mutateUpdate.mutateAsync({ id: selectedId, payload: payload as Partial<FormState> });
      } else {
        await mutateCreate.mutateAsync(payload as Omit<FormState, "id">);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formState, selectedId, pendingImageFile, uploadPendingImage, mutateCreate, mutateUpdate]);

  const sortedAds = useMemo(
    () => [...ads].sort((a, b) => a.ordering - b.ordering),
    [ads]
  );

  const filteredAds = useMemo(() => {
    if (statusFilter === "all") return sortedAds;
    if (statusFilter === "active") return sortedAds.filter((ad) => ad.is_active);
    return sortedAds.filter((ad) => !ad.is_active);
  }, [sortedAds, statusFilter]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Publicidad</h1>
            <p className="text-sm text-muted-foreground">
              Administrá los banners que se muestran en la app (solo las activas aparecen).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdvertisementFilterOption)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => openDialog()}>Nueva publicidad</Button>
          </div>
        </CardHeader>
      <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                <TableHead>Preview</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2Icon className="h-5 w-5 animate-spin" />
                        <span>Cargando...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredAds.map((ad) => (
                      <TableRow key={ad.id}>
                        <TableCell className="h-14 w-24">
                          {ad.image_url ? (
                            <Image
                              src={ad.image_url}
                              alt={ad.name}
                              width={96}
                              height={40}
                              className="rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-20 rounded bg-muted/40" />
                          )}
                        </TableCell>
                        <TableCell>{ad.name}</TableCell>
                        <TableCell>{ad.ordering}</TableCell>
                        <TableCell>
                          {ad.is_active ? "Sí" : "No"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openDialog(ad)}
                              aria-label="Editar publicidad"
                            >
                              <FilePenIcon className="h-4 w-4" />
                            </Button>
                            {ad.is_active ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => mutateDeactivate.mutate(ad.id)}
                                aria-label="Inactivar publicidad"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => mutateReactivate.mutate(ad.id)}
                                disabled={mutateReactivate.isPending}
                                aria-label="Reactivar publicidad"
                              >
                                <RotateCcwIcon className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredAds.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4">
                          {sortedAds.length
                            ? "No hay publicidades con este filtro"
                            : "No hay publicidades todavía"}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedId ? "Editar publicidad" : "Nueva publicidad"}</DialogTitle>
            <DialogDescription>
              Completá la información y elegí una imagen. La imagen se subirá al bucket al guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Nombre</Label>
              <Input
                value={formState.name}
                onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>Imagen</Label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setPendingImageFile(file);
                  setPendingImagePreview((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return URL.createObjectURL(file);
                  });
                }}
              />
              {pendingImagePreview ? (
                <div className="w-full">
                  <img
                    src={pendingImagePreview}
                    alt="Preview"
                    className="w-full max-h-40 rounded object-cover"
                  />
                </div>
              ) : formState.image_url ? (
                <div className="w-full">
                  <Image
                    src={formState.image_url}
                    alt="Preview"
                    width={240}
                    height={80}
                    className="w-full rounded object-cover"
                  />
                </div>
              ) : null}
            </div>
            <div className="grid gap-1">
              <Label>Descripción</Label>
              <Textarea
                value={formState.description}
                onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Orden</Label>
                <Input
                  type="number"
                  value={formState.ordering}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, ordering: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Activa</Label>
                <Switch
                  id="ad-active"
                  checked={formState.is_active}
                  onCheckedChange={(checked) =>
                    setFormState((prev) => ({ ...prev, is_active: Boolean(checked) }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 space-x-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || mutateCreate.isPending || mutateUpdate.isPending}>
              {isSubmitting ? "Subiendo imagen..." : selectedId ? "Guardar cambios" : "Crear publicidad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
