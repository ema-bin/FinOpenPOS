"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2Icon } from "lucide-react";
import type { TeamDTO } from "@/models/dto/tournament";

export type TournamentGroupSlotDisplay = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
};

interface TeamScheduleRestrictionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamDTO | null;
  slots: TournamentGroupSlotDisplay[];
  onSave: (restrictedSlotIds: number[], scheduleNotes?: string | null) => Promise<void>;
  /** Si se pasa, se muestra un botón para inicializar disponibilidad (una fila por slot con puede jugar). */
  onInitialize?: () => Promise<void>;
}

export function TeamScheduleRestrictionsDialog({
  open,
  onOpenChange,
  team,
  slots,
  onSave,
  onInitialize,
}: TeamScheduleRestrictionsDialogProps) {
  const [restrictedSlotIds, setRestrictedSlotIds] = useState<Set<number>>(new Set());
  const [scheduleNotes, setScheduleNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const teamRestrictedSlotIds = team?.restricted_slot_ids ?? [];

  useEffect(() => {
    if (open && team) {
      setRestrictedSlotIds(new Set(teamRestrictedSlotIds));
      setScheduleNotes(team.schedule_notes || "");
    } else if (!open) {
      setRestrictedSlotIds(new Set());
      setScheduleNotes("");
    }
  }, [open, team?.id, team?.schedule_notes, teamRestrictedSlotIds.join(",")]);

  const handleToggleSlot = (slotId: number) => {
    setRestrictedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const handleToggleDay = (_date: string, daySlots: TournamentGroupSlotDisplay[]) => {
    const dayIds = daySlots.map((s) => s.id);
    const allCanPlay = dayIds.every((id) => !restrictedSlotIds.has(id));
    setRestrictedSlotIds((prev) => {
      const next = new Set(prev);
      if (allCanPlay) dayIds.forEach((id) => next.add(id)); // marcar todo el día como no puede
      else dayIds.forEach((id) => next.delete(id)); // marcar todo el día como puede
      return next;
    });
  };

  const isDayFullyCanPlay = (daySlots: TournamentGroupSlotDisplay[]) =>
    daySlots.length > 0 && daySlots.every((s) => !restrictedSlotIds.has(s.id));

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(Array.from(restrictedSlotIds), scheduleNotes.trim() || null);
      onOpenChange(false);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error al guardar restricciones");
    } finally {
      setSaving(false);
    }
  };

  const teamName = team
    ? team.display_name ||
      `${team.player1.first_name} ${team.player1.last_name} / ${team.player2.first_name} ${team.player2.last_name}`
    : "";

  const sortedSlots = [...slots].sort((a, b) => {
    if (a.slot_date !== b.slot_date) return a.slot_date.localeCompare(b.slot_date);
    return a.start_time.localeCompare(b.start_time);
  });

  const slotsByDate = sortedSlots.reduce(
    (acc, slot) => {
      const d = slot.slot_date;
      if (!acc[d]) acc[d] = [];
      acc[d].push(slot);
      return acc;
    },
    {} as Record<string, TournamentGroupSlotDisplay[]>
  );

  const formatTime = (time: string) => time.substring(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Disponibilidad horaria</DialogTitle>
          <DialogDescription>
            Marcá los horarios en los que {teamName} <strong>puede</strong> jugar. Los no marcados son
            horarios en los que no puede.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
          {onInitialize && slots.length > 0 && (
            <div className="p-3 rounded-md border bg-muted/50 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Si este equipo aún no tiene disponibilidad cargada, inicializala para marcar en qué horarios puede jugar.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={initializing}
                onClick={async () => {
                  try {
                    setInitializing(true);
                    await onInitialize();
                  } finally {
                    setInitializing(false);
                  }
                }}
              >
                {initializing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Inicializar disponibilidad"}
              </Button>
            </div>
          )}
          {slots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-2">No hay horarios (slots) configurados para este torneo.</p>
              <p className="text-sm">Usá el botón &quot;Generar horarios&quot; en la pestaña Inscripción.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.keys(slotsByDate)
                .sort()
                .map((date) => {
                  const daySlots = slotsByDate[date];
                  const dateObj = new Date(date + "T00:00:00");
                  const formattedDate = dateObj.toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  });

                  const dayAllCanPlay = isDayFullyCanPlay(daySlots);
                  return (
                    <div key={date} className="space-y-2">
                      <div className="flex items-center space-x-2 pb-1">
                        <Checkbox
                          id={`day-${date}`}
                          checked={dayAllCanPlay}
                          onCheckedChange={() => handleToggleDay(date, daySlots)}
                        />
                        <Label
                          htmlFor={`day-${date}`}
                          className="font-semibold text-sm text-muted-foreground uppercase tracking-wide cursor-pointer"
                        >
                          {formattedDate} — puede jugar todo el día
                        </Label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {daySlots.map((slot) => {
                          const canPlay = !restrictedSlotIds.has(slot.id);
                          return (
                            <div
                              key={slot.id}
                              className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <Checkbox
                                id={`slot-${slot.id}`}
                                checked={canPlay}
                                onCheckedChange={() => handleToggleSlot(slot.id)}
                              />
                              <Label
                                htmlFor={`slot-${slot.id}`}
                                className="flex-1 cursor-pointer font-normal"
                              >
                                <div className="font-medium text-sm">
                                  {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {canPlay ? "Puede jugar" : "No puede"}
                                </div>
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="schedule-notes" className="text-sm font-medium">
              Notas sobre disponibilidad horaria (opcional)
            </Label>
            <Textarea
              id="schedule-notes"
              placeholder="Ej: Solo disponible después de las 18:00 los días de semana..."
              value={scheduleNotes}
              onChange={(e) => setScheduleNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Información adicional sobre la disponibilidad horaria de esta pareja.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
