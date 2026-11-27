"use client";

import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyIcon, Loader2Icon, SendIcon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { courtReservationsService } from "@/services";
import { addDaysIso, WEEKDAY_LABELS, weekdayOf } from "@/lib/class-time";
import type { ClubSettings } from "@/lib/clubs/settings";
import { freeSlotsBlock, freeSlotsStart } from "@/lib/free-slots-message";

const MAX_DAYS_AHEAD = 6;

function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: Number(pick("hour")) % 24,
    minute: Number(pick("minute")),
  };
}

/** Abre la app instalada. Si el navegador no sale de la página, no hay app y va a WhatsApp Web. */
function openWhatsApp(text: string) {
  const encoded = encodeURIComponent(text);
  let left = false;
  const onLeave = () => {
    left = true;
  };
  window.addEventListener("blur", onLeave, { once: true });
  document.addEventListener("visibilitychange", onLeave, { once: true });
  window.location.href = `whatsapp://send?text=${encoded}`;
  window.setTimeout(() => {
    window.removeEventListener("blur", onLeave);
    document.removeEventListener("visibilitychange", onLeave);
    if (!left) window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank", "noopener");
  }, 1500);
}

export function FreeSlotsMessage() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [daysAhead, setDaysAhead] = useState(0);
  const [edited, setEdited] = useState<string | null>(null);

  const { data: club } = useQuery({
    queryKey: ["club-settings"],
    queryFn: async () => {
      const response = await fetch("/api/club");
      if (!response.ok) return null;
      return response.json() as Promise<ClubSettings>;
    },
    staleTime: 60_000,
  });
  const { data: courts = [] } = useQuery({
    queryKey: ["courts", "active"],
    queryFn: async () => {
      const response = await fetch("/api/courts");
      if (!response.ok) throw new Error("No se pudieron cargar las canchas");
      return response.json() as Promise<Array<{ id: number; name: string }>>;
    },
  });

  const openTime = club?.open_time ?? "10:00";
  const start = freeSlotsStart({
    ...localClock(now, club?.timezone ?? "America/Argentina/Buenos_Aires"),
    openTime,
    closeTime: club?.close_time ?? "01:00",
    overnight: club?.overnight_slot ?? true,
  });
  const dates = Array.from({ length: daysAhead + 1 }, (_, offset) => addDaysIso(start.date, offset));
  const days = useQueries({
    queries: dates.map((date) => ({
      queryKey: ["court-reservations", date],
      queryFn: () => courtReservationsService.day(date),
      enabled: open,
      staleTime: 0,
    })),
  });
  const loading = days.some((day) => day.isLoading);
  const failed = days.find((day) => day.isError)?.error;

  const blocks: string[] = [];
  const missing: string[] = [];
  for (let offset = 0; offset < dates.length; offset += 1) {
    const slots = days[offset]?.data;
    if (!slots) continue;
    if (slots.length === 0) {
      missing.push(WEEKDAY_LABELS[weekdayOf(dates[offset])]);
      continue;
    }
    blocks.push(freeSlotsBlock({
      date: dates[offset],
      slots,
      courts,
      openTime,
      fromOrder: offset === 0 ? start.fromOrder : undefined,
    }));
  }
  const text = edited ?? blocks.join("\n\n");

  function changeDaysAhead(value: string) {
    const parsed = Math.trunc(Number(value));
    setEdited(null);
    setDaysAhead(Number.isFinite(parsed) ? Math.min(MAX_DAYS_AHEAD, Math.max(0, parsed)) : 0);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto shrink-0 px-3 py-1.5"
        onClick={() => {
          setNow(new Date());
          setEdited(null);
          setOpen(true);
        }}
      >
        <Share2Icon className="mr-1.5 h-4 w-4" />
        Compartir libres
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensaje de turnos libres</DialogTitle>
            <DialogDescription>
              Hoy entra desde la hora actual. Podés sumar días hacia adelante y retocar el texto antes de mandarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="free-days-ahead" className="text-sm font-normal">Días hacia adelante</Label>
              <Input
                id="free-days-ahead"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_DAYS_AHEAD}
                value={daysAhead}
                onChange={(event) => changeDaysAhead(event.target.value)}
                className="w-20"
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2Icon className="h-5 w-5 animate-spin" /></div>
            ) : failed ? (
              <p className="text-sm text-destructive">
                {failed instanceof Error ? failed.message : "No se pudieron cargar los turnos"}
              </p>
            ) : (
              <>
                <Textarea
                  rows={12}
                  value={text}
                  placeholder="No hay turnos generados para esos días."
                  onChange={(event) => setEdited(event.target.value)}
                  className="font-mono text-sm"
                />
                {missing.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin turnos generados: {missing.join(", ")}. No entran en el mensaje.
                  </p>
                ) : null}
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={copy} disabled={!text.trim()}>
              <CopyIcon className="mr-2 h-4 w-4" />
              Copiar
            </Button>
            <Button
              type="button"
              disabled={!text.trim()}
              onClick={() => openWhatsApp(text)}
            >
              <SendIcon className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
