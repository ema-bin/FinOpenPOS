"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { whatsappMessageTemplatesService } from "@/services";
import type {
  WhatsAppMessageTemplateDTO,
  WhatsAppTemplateKind,
} from "@/models/db/whatsapp-message-template";
import {
  advanceRotation,
  createRotation,
  currentRotationId,
  pickRandomVariant,
  type VariantRotation,
} from "@/lib/whatsapp-message-variants";

export function useWhatsAppMessageVariants(
  kind: WhatsAppTemplateKind,
  fallbackTemplate: string
) {
  const queryClient = useQueryClient();
  const queryKey = ["whatsapp-message-templates", kind];

  const { data: variants = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => whatsappMessageTemplatesService.getByKind(kind),
    staleTime: 1000 * 60,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [rotate, setRotate] = useState(false);
  const [rotation, setRotation] = useState<VariantRotation>({ order: [], position: 0 });

  const variantIdsKey = variants.map((v) => v.id).join(",");
  useEffect(() => {
    setRotation(createRotation(variantIdsKey ? variantIdsKey.split(",").map(Number) : []));
  }, [variantIdsKey]);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;
  const savedBody = selected?.body ?? fallbackTemplate;
  const text = draft ?? savedBody;
  const isDirty = draft != null && draft !== savedBody;

  const select = useCallback((id: number) => {
    setSelectedId(id);
    setDraft(null);
  }, []);

  const pickRandom = () => {
    const next = pickRandomVariant(variants, selected?.id ?? null);
    if (next) select(next.id);
    setRotation((prev) => createRotation(prev.order, Math.random, currentRotationId(prev)));
  };

  const rotationVariant = rotate
    ? variants.find((v) => v.id === currentRotationId(rotation)) ?? null
    : null;
  const activeTemplate: { body: string; name: string | null } = rotationVariant
    ? { body: rotationVariant.body, name: rotationVariant.name }
    : { body: text, name: selected?.name ?? null };

  /**
   * Llamar al enviar un mensaje: en modo rotación el próximo usa otra variante.
   * Se difiere para que el <a> navegue con el href que se clickeó y no con el siguiente.
   */
  const markSent = useCallback(() => {
    if (!rotate) return;
    setTimeout(() => setRotation((prev) => advanceRotation(prev)), 0);
  }, [rotate]);

  const setCachedVariants = (
    updater: (prev: WhatsAppMessageTemplateDTO[]) => WhatsAppMessageTemplateDTO[]
  ) => {
    queryClient.setQueryData<WhatsAppMessageTemplateDTO[]>(queryKey, (prev) =>
      updater(prev ?? [])
    );
  };

  const saveMutation = useMutation({
    mutationFn: () => whatsappMessageTemplatesService.update(selected!.id, { body: text }),
    onSuccess: (updated) => {
      setCachedVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setDraft(null);
      toast.success(`Variante "${updated.name}" guardada`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      whatsappMessageTemplatesService.create({ kind, name, body: text }),
    onSuccess: (created) => {
      setCachedVariants((prev) => [...prev, created]);
      select(created.id);
      toast.success(`Variante "${created.name}" creada`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => whatsappMessageTemplatesService.delete(id),
    onSuccess: (_data, id) => {
      setCachedVariants((prev) => prev.filter((v) => v.id !== id));
      setSelectedId(null);
      setDraft(null);
      toast.success("Variante eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    variants,
    isLoading,
    isError,
    selected,
    text,
    isDirty,
    rotate,
    setRotate,
    activeTemplate,
    markSent,
    setDraft,
    discardDraft: () => setDraft(null),
    select,
    pickRandom,
    saveChanges: () => saveMutation.mutate(),
    saveAsNew: (name: string) => createMutation.mutateAsync(name),
    remove: (id: number) => deleteMutation.mutate(id),
    isSaving: saveMutation.isPending || createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export type WhatsAppMessageVariantsState = ReturnType<typeof useWhatsAppMessageVariants>;
