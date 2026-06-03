"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2Icon,
  CopyIcon,
  UploadIcon,
  Trash2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import type { TournamentDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import { CopyImageError, copyPngBlobToClipboard } from "@/lib/copy-image-url";
import { useTournamentFlyerBlob } from "@/hooks/use-tournament-flyer-blob";
import { toast } from "sonner";

export default function ShareTournamentFlyerTab({
  tournament,
}: {
  tournament: Pick<TournamentDTO, "id" | "name" | "promo_flyer_url">;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const currentUrl = tournament.promo_flyer_url?.trim() || null;
  const displayUrl = previewUrl ?? currentUrl;
  const {
    pngBlob: flyerPngBlob,
    loading: flyerPngLoading,
    ready: flyerPngReady,
  } = useTournamentFlyerBlob(tournament.id, Boolean(currentUrl), currentUrl ?? undefined);

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      tournamentsService.uploadPromoFlyer(tournament.id, file),
    onSuccess: async (data) => {
      toast.success("Flier subido");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPendingFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const newUrl = data.promo_flyer_url ?? data.url;
      queryClient.setQueryData<TournamentDTO | undefined>(
        ["tournament", tournament.id],
        (prev) => (prev ? { ...prev, promo_flyer_url: newUrl } : prev)
      );
      await queryClient.refetchQueries({ queryKey: ["tournament", tournament.id] });
      queryClient.invalidateQueries({
        queryKey: ["tournament-registration-notifications", tournament.id],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => tournamentsService.removePromoFlyer(tournament.id),
    onSuccess: () => {
      toast.success("Flier eliminado");
      setPendingFile(null);
      setPreviewUrl(null);
      queryClient.invalidateQueries({ queryKey: ["tournament", tournament.id] });
      queryClient.invalidateQueries({
        queryKey: ["tournament-registration-notifications", tournament.id],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    },
    [previewUrl]
  );

  const handleUpload = () => {
    if (!pendingFile) {
      toast.error("Elegí una imagen primero");
      return;
    }
    uploadMutation.mutate(pendingFile);
  };

  const handleCopyImage = async () => {
    if (!flyerPngBlob) {
      toast.error(
        flyerPngLoading ? "Preparando flier para copiar…" : "Subí un flier primero"
      );
      return;
    }
    setCopying(true);
    try {
      await copyPngBlobToClipboard(flyerPngBlob);
      toast.success("Flier copiado al portapapeles");
    } catch (err) {
      console.error("copy flyer:", err);
      toast.error(
        err instanceof CopyImageError ? err.message : "No se pudo copiar la imagen"
      );
    } finally {
      setCopying(false);
    }
  };

  const handleCopyLink = () => {
    const url = currentUrl;
    if (!url) {
      toast.error("Subí un flier primero");
      return;
    }
    navigator.clipboard.writeText(url);
    toast.success("Link del flier copiado");
  };

  return (
    <Card className="border-none shadow-none p-0">
      <CardHeader className="px-0 pt-0">
        <CardTitle>Flier de promoción</CardTitle>
        <CardDescription>
          Subí el flier que generaste por fuera (PNG, JPG o WebP). Se guarda en
          Supabase y se usa en notificaciones WhatsApp y para compartir.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 pt-4 space-y-4">
        <div className="space-y-2 max-w-md">
          <Label htmlFor="flyer-file">Imagen del flier</Label>
          <Input
            id="flyer-file"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFileChange}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleUpload}
              disabled={!pendingFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <UploadIcon className="h-4 w-4 mr-1" />
              )}
              {currentUrl ? "Reemplazar flier" : "Subir flier"}
            </Button>
            {currentUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending ? (
                  <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2Icon className="h-4 w-4 mr-1" />
                )}
                Quitar
              </Button>
            )}
          </div>
        </div>

        {displayUrl ? (
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyImage}
                disabled={copying || !currentUrl || !flyerPngReady}
              >
                {copying || flyerPngLoading ? (
                  <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CopyIcon className="h-4 w-4 mr-1" />
                )}
                {flyerPngLoading ? "Preparando…" : "Copiar imagen"}
              </Button>
              {currentUrl && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                  >
                    <CopyIcon className="h-4 w-4 mr-1" />
                    Copiar link
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLinkIcon className="h-4 w-4 mr-1" />
                      Abrir
                    </a>
                  </Button>
                </>
              )}
            </div>
            <div className="rounded-lg border-2 border-gray-200 shadow-lg overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={displayUrl}
                src={displayUrl}
                alt={`Flier ${tournament.name}`}
                className="w-full h-auto max-h-[70vh] object-contain"
              />
            </div>
            {pendingFile && !uploadMutation.isPending && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Vista previa sin guardar. Pulsá &quot;Reemplazar flier&quot; para
                subir.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg border-dashed">
            Todavía no hay flier. Generá la imagen donde quieras y subila acá.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
