"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { toast } from "sonner";
import { useErrorNotifications } from "@/hooks/useErrorNotifications";
import { useCourtSlotsData } from "@/components/court-slots/hooks/useCourtSlotsData";
import { useCourtSlotsMutations } from "@/components/court-slots/hooks/useCourtSlotsMutations";
import { useDayReport } from "@/components/court-slots/hooks/useDayReport";
import { usePdfGenerator } from "@/components/court-slots/hooks/usePdfGenerator";
import { CourtSlotFilters } from "@/components/court-slots/CourtSlotFilters";
import { DayNotesEditor } from "@/components/court-slots/DayNotesEditor";
import { ColorLegend } from "@/components/court-slots/ColorLegend";
import { CourtSlotTable } from "@/components/court-slots/CourtSlotTable";
import { DaySummary } from "@/components/court-slots/DaySummary";
import { CourtPricingDialog } from "@/components/court-slots/CourtPricingDialog";
import type { CourtSlotDTO } from "@/models/dto/court";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/components/permissions-provider";
import { playersService, slotCreditsService } from "@/services";
import { creditSaveError, seatsFromSlot } from "@/lib/slot-credits";
import type { SlotChanges } from "@/components/court-slots/SeatEditors";
import Link from "next/link";

export default function CourtSlotsPage() {
  const { can, canRead, loading: permsLoading } = usePermissions();
  const canEditPricing = !permsLoading && can("courts.pricing");
  const canEditSlots = !permsLoading && can("courts.operate");
  const canSeePacks =
    !permsLoading &&
    (canRead("packs.define") || canRead("packs.sell") || canRead("packs.credits"));
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [dayNotes, setDayNotes] = useState<string>("");
  const [isEditingDayNotes, setIsEditingDayNotes] = useState(false);

  const [pendingChanges, setPendingChanges] = useState<
    Map<number, SlotChanges>
  >(new Map());

  // Hooks de datos
  const {
    paymentMethods,
    loadingPayments,
    isPaymentMethodsError,
    slots,
    loadingSlots,
    fetchingSlots,
    refetchSlots,
    isCourtSlotsError,
    dayNoteData,
    loadingDayNotes,
  } = useCourtSlotsData(selectedDate);

  // Obtener canchas activas
  const { data: courts = [] } = useQuery({
    queryKey: ["courts", "active"],
    queryFn: async () => {
      const response = await fetch("/api/courts");
      if (!response.ok) throw new Error("Failed to fetch courts");
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: players = [] } = useQuery({
    queryKey: ["players", "onlyActive"],
    queryFn: () => playersService.getAll("active"),
    staleTime: 1000 * 60,
  });

  const {
    data: positiveBalances = [],
    isSuccess: positiveLoaded,
    isError: positiveFailed,
  } = useQuery({
    queryKey: ["slot-credits", "positive"],
    queryFn: () => slotCreditsService.positiveBalances(),
  });

  // Limpiar cambios pendientes cuando cambia la fecha
  useEffect(() => {
    setPendingChanges(new Map());
  }, [selectedDate]);

  // Hooks de mutaciones
  const { generateMutation, updateSlotMutation, saveDayNotesMutation } =
    useCourtSlotsMutations(selectedDate, slots, paymentMethods);

  // Slots con cambios aplicados localmente para mostrar en la UI
  const localSlots = useMemo(() => {
    return slots.map((slot) => {
      const changes = pendingChanges.get(slot.id);
      if (!changes) return slot;

      const updated: CourtSlotDTO = { ...slot };
      if ('was_played' in changes && changes.was_played !== undefined) {
        updated.was_played = changes.was_played;
      }
      if ('notes' in changes && changes.notes !== undefined) {
        updated.notes = changes.notes;
      }
      if ('player1_note' in changes && changes.player1_note !== undefined) {
        updated.player1_note = changes.player1_note;
      }
      if ('player2_note' in changes && changes.player2_note !== undefined) {
        updated.player2_note = changes.player2_note;
      }
      if ('player3_note' in changes && changes.player3_note !== undefined) {
        updated.player3_note = changes.player3_note;
      }
      if ('player4_note' in changes && changes.player4_note !== undefined) {
        updated.player4_note = changes.player4_note;
      }
      // Si el turno no fue jugado, los métodos de pago deben ser null
      if (!updated.was_played) {
        updated.player1_payment_method = null;
        updated.player2_payment_method = null;
        updated.player3_payment_method = null;
        updated.player4_payment_method = null;
        updated.player1_id = null;
        updated.player2_id = null;
        updated.player3_id = null;
        updated.player4_id = null;
        updated.player1 = null;
        updated.player2 = null;
        updated.player3 = null;
        updated.player4 = null;
      } else {
        // Solo aplicar cambios de métodos de pago si el turno fue jugado
        if ('player1_payment_method_id' in changes && changes.player1_payment_method_id !== undefined) {
          updated.player1_payment_method = changes.player1_payment_method_id
            ? paymentMethods.find((pm) => pm.id === changes.player1_payment_method_id) || null
            : null;
        }
        if ('player2_payment_method_id' in changes && changes.player2_payment_method_id !== undefined) {
          updated.player2_payment_method = changes.player2_payment_method_id
            ? paymentMethods.find((pm) => pm.id === changes.player2_payment_method_id) || null
            : null;
        }
        if ('player3_payment_method_id' in changes && changes.player3_payment_method_id !== undefined) {
          updated.player3_payment_method = changes.player3_payment_method_id
            ? paymentMethods.find((pm) => pm.id === changes.player3_payment_method_id) || null
            : null;
        }
        if ('player4_payment_method_id' in changes && changes.player4_payment_method_id !== undefined) {
          updated.player4_payment_method = changes.player4_payment_method_id
            ? paymentMethods.find((pm) => pm.id === changes.player4_payment_method_id) || null
            : null;
        }
        const applyPlayer = (
          key: "player1_id" | "player2_id" | "player3_id" | "player4_id",
          field: "player1" | "player2" | "player3" | "player4"
        ) => {
          if (!(key in changes) || changes[key] === undefined) return;
          const playerId = changes[key] ?? null;
          updated[key] = playerId;
          const player = players.find((item) => item.id === playerId);
          updated[field] = player
            ? { id: player.id, first_name: player.first_name, last_name: player.last_name }
            : null;
        };
        applyPlayer("player1_id", "player1");
        applyPlayer("player2_id", "player2");
        applyPlayer("player3_id", "player3");
        applyPlayer("player4_id", "player4");
      }
      return updated;
    });
  }, [slots, pendingChanges, paymentMethods, players]);

  const creditPlayerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const slot of localSlots) {
      for (const id of [slot.player1_id, slot.player2_id, slot.player3_id, slot.player4_id]) {
        if (id) ids.add(id);
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [localSlots]);

  const { data: balanceRows = [], isSuccess: balancesLoaded, isError: balancesFailed } = useQuery({
    queryKey: ["slot-credits", creditPlayerIds.join(",")],
    queryFn: () => slotCreditsService.balances(creditPlayerIds),
    enabled: creditPlayerIds.length > 0,
  });

  const balances = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of positiveBalances) map.set(row.player_id, row.balance);
    for (const row of balanceRows) map.set(row.player_id, row.balance);
    return map;
  }, [positiveBalances, balanceRows]);

  const qrPlayers = useMemo(() => {
    if (positiveFailed) return players;
    if (!positiveLoaded) return [];
    const ids = new Set(
      positiveBalances.filter((row) => row.balance > 0).map((row) => row.player_id)
    );
    return players.filter((player) => ids.has(player.id));
  }, [players, positiveBalances, positiveFailed, positiveLoaded]);

  const playerNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const player of players) {
      map.set(player.id, `${player.first_name} ${player.last_name}`.trim());
    }
    for (const slot of localSlots) {
      for (const player of [slot.player1, slot.player2, slot.player3, slot.player4]) {
        if (player && !map.has(player.id)) {
          map.set(player.id, `${player.first_name} ${player.last_name}`.trim());
        }
      }
    }
    return map;
  }, [players, localSlots]);
  const { dayReport, totalRevenue, playedByCourtType, unpaidByCourtType } = useDayReport(
    localSlots,
    paymentMethods
  );

  // Hook de PDF
  const { handleDownloadPdf } = usePdfGenerator();

  // Manejo de errores
  useErrorNotifications([
    {
      error: isPaymentMethodsError,
      message: "No se pudieron cargar los métodos de pago.",
    },
    {
      error: isCourtSlotsError,
      message: "No se pudieron cargar los turnos de canchas.",
    },
    {
      error: positiveFailed,
      message: "No se pudieron cargar los jugadores con créditos.",
    },
  ]);

  // Sync de notas del día
  useEffect(() => {
    if (dayNoteData) {
      setDayNotes(dayNoteData.notes || "");
    } else {
      setDayNotes("");
    }
    setIsEditingDayNotes(false);
  }, [dayNoteData]);

  // Handlers
  const handleGenerateDay = () => {
    if (slots.length > 0) {
      toast.info("Los turnos para este día ya fueron generados.");
      return;
    }
    generateMutation.mutate(selectedDate);
  };

  const handleRefresh = () => {
    refetchSlots();
  };

  // Actualizar cambios pendientes localmente (sin guardar)
  const updateSlotField = (
    slotId: number,
    patch: SlotChanges
  ) => {
    setPendingChanges((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(slotId) || {};
      
      // Si se marca como no jugado, limpiar todos los métodos de pago
      if ('was_played' in patch && patch.was_played === false) {
        newMap.set(slotId, {
          ...existing,
          was_played: false,
          player1_payment_method_id: null,
          player2_payment_method_id: null,
          player3_payment_method_id: null,
          player4_payment_method_id: null,
          player1_id: null,
          player2_id: null,
          player3_id: null,
          player4_id: null,
        });
      } else {
        newMap.set(slotId, { ...existing, ...patch });
      }
      
      return newMap;
    });
  };

  // Guardar cambios de un slot específico
  const handleSaveSlot = (slotId: number) => {
    const changes = pendingChanges.get(slotId);
    if (!changes || Object.keys(changes).length === 0) {
      return;
    }

    const local = localSlots.find((slot) => slot.id === slotId);
    const saved = slots.find((slot) => slot.id === slotId);
    if (local && saved) {
      if (creditPlayerIds.length > 0 && !balancesLoaded && !balancesFailed) {
        toast.error("Todavía se está cargando el saldo.");
        return;
      }
      const message = creditSaveError({
        wasPlayed: local.was_played,
        seats: seatsFromSlot(local),
        savedWasPlayed: saved.was_played,
        savedSeats: seatsFromSlot(saved),
        methods: paymentMethods,
        balances: balancesLoaded ? balances : null,
        playerNames,
      });
      if (message) {
        toast.error(message);
        return;
      }
    }

    updateSlotMutation.mutate(
      { slotId, patch: changes },
      {
        onSuccess: () => {
          // Limpiar cambios pendientes de este slot
          setPendingChanges((prev) => {
            const newMap = new Map(prev);
            newMap.delete(slotId);
            return newMap;
          });
          toast.success("Cambios guardados correctamente.");
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Error al guardar los cambios."
          );
        },
      }
    );
  };

  // Cancelar cambios de un slot específico
  const handleCancelSlot = (slotId: number) => {
    setPendingChanges((prev) => {
      const newMap = new Map(prev);
      newMap.delete(slotId);
      return newMap;
    });
  };

  const handleSaveDayNotes = (notes: string | null) => {
    saveDayNotesMutation.mutate(notes);
  };

  const handleCancelDayNotes = () => {
    setIsEditingDayNotes(false);
    setDayNotes(dayNoteData?.notes || "");
  };

  const handleDownloadPdfClick = () => {
    handleDownloadPdf(
      selectedDate,
      localSlots,
      dayReport,
      totalRevenue,
      playedByCourtType as Record<string, string[]>,
      unpaidByCourtType as Record<string, Array<{ courtName: string; timeRange: string; unpaidCount: number }>>,
      dayNoteData || null,
      dayNotes
    );
  };

  const initialSlotsLoading = loadingSlots && !localSlots.length;
  const saving = updateSlotMutation.isPending;

  return (
    <Card className="flex flex-col gap-4 p-6 max-md:p-3">
      <CardHeader className="p-0 space-y-1">
        <CardTitle>Turnos de canchas</CardTitle>
        <CardDescription>
          Generá los turnos diarios y registrá el pago de cada puesto. Con QR,
          elegí el jugador para descontar un crédito.
          {canSeePacks ? (
            <>
              {" "}
              <Link href="/admin/slot-packs" className="text-primary underline">
                Packs de turnos
              </Link>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-0">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <CourtSlotFilters
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onRefresh={handleRefresh}
              onGenerate={handleGenerateDay}
              isGenerating={generateMutation.isPending}
              isRefreshing={fetchingSlots}
              canGenerate={canEditSlots}
            />

            <DayNotesEditor
              notes={dayNotes}
              isEditing={isEditingDayNotes}
              onEdit={() => setIsEditingDayNotes(true)}
              onSave={handleSaveDayNotes}
              onCancel={handleCancelDayNotes}
              onNotesChange={setDayNotes}
              isSaving={saveDayNotesMutation.isPending}
              isLoading={loadingDayNotes}
              readOnly={!canEditSlots}
            />

            {canEditPricing && (
              <div className="flex gap-2 flex-wrap">
                {courts.map((court: { id: number; name: string }) => (
                  <CourtPricingDialog
                    key={court.id}
                    court={court}
                  />
                ))}
              </div>
            )}

            <ColorLegend
              paymentMethods={paymentMethods}
              isLoadingPayments={loadingPayments}
              courts={courts}
            />

            <CourtSlotTable
              slots={localSlots}
              paymentMethods={paymentMethods}
              players={qrPlayers}
              balances={balances}
              playersReady={positiveLoaded || positiveFailed}
              onSlotUpdate={updateSlotField}
              onSaveSlot={handleSaveSlot}
              onCancelSlot={handleCancelSlot}
              pendingChanges={pendingChanges}
              isSaving={updateSlotMutation.isPending}
              isLoading={loadingSlots && slots.length === 0}
              readOnly={!canEditSlots}
            />
          </div>

          <DaySummary
            selectedDate={selectedDate}
            dayReport={dayReport}
            totalRevenue={totalRevenue}
            playedByCourtType={playedByCourtType}
            unpaidByCourtType={unpaidByCourtType}
            onDownloadPdf={handleDownloadPdfClick}
            hasSlots={localSlots.length > 0}
          />
        </div>
      </CardContent>
    </Card>
  );
}
