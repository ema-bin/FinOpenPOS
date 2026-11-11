import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { courtSlotsService, courtSlotDayNotesService } from "@/services";
import type { UpdateCourtSlotInput } from "@/services/court-slots.service";

export function useCourtSlotsMutations(
  selectedDate: string,
  slots: any[],
  paymentMethods: any[]
) {
  const queryClient = useQueryClient();

  // Generar turnos del día
  const generateMutation = useMutation({
    mutationFn: async (date: string) => {
      return courtSlotsService.generate({ date });
    },
    onSuccess: () => {
      toast.success("Turnos generados correctamente.");
      queryClient.invalidateQueries({ queryKey: ["court-slots", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["slot-credits"] });
      queryClient.invalidateQueries({ queryKey: ["slot-packs"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron generar los turnos del día."
      );
    },
  });

  // Actualizar un slot
  const updateSlotMutation = useMutation({
    mutationFn: async (params: { slotId: number; patch: UpdateCourtSlotInput }) => {
      return courtSlotsService.update(params.slotId, params.patch);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<any[]>(
        ["court-slots", selectedDate],
        (old) => old?.map((s) => (s.id === updated.id ? updated : s)) ?? []
      );
      queryClient.invalidateQueries({ queryKey: ["slot-credits"] });
      queryClient.invalidateQueries({ queryKey: ["slot-packs"] });
    },
  });

  // Mutation para guardar notas del día
  const saveDayNotesMutation = useMutation({
    mutationFn: async (notes: string | null) => {
      return courtSlotDayNotesService.upsert(selectedDate, notes);
    },
    onSuccess: () => {
      toast.success("Notas del día guardadas correctamente.");
      queryClient.invalidateQueries({ queryKey: ["court-slot-day-notes", selectedDate] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar las notas del día."
      );
    },
  });

  return {
    generateMutation,
    updateSlotMutation,
    saveDayNotesMutation,
  };
}
