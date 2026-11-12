import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SaveIcon, Loader2Icon, XIcon } from "lucide-react";
import { courtPillClasses, formatTime } from "@/lib/court-slots-utils";
import { SeatEditors, type SlotChanges } from "./SeatEditors";
import type { CourtSlotDTO } from "@/models/dto/court";
import type { PaymentMethodDTO } from "@/models/dto/payment-method";
import type { PlayerDTO } from "@/models/dto/player";

interface CourtSlotRowProps {
  slot: CourtSlotDTO;
  paymentMethods: PaymentMethodDTO[];
  players: PlayerDTO[];
  balances: ReadonlyMap<number, number>;
  playersReady: boolean;
  onUpdate: (slotId: number, patch: SlotChanges) => void;
  onSave: () => void;
  onCancel: () => void;
  hasChanges: boolean;
  isSaving: boolean;
  readOnly?: boolean;
  reservationLabel?: string | null;
}

function formatSlotDate(slotDate: string) {
  const [year, month, day] = slotDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return format(date, "EEEE dd/MM/yyyy", { locale: es }).toUpperCase();
}

function slotTone(
  classBlock: CourtSlotDTO["class_block"],
  tournamentBlock: CourtSlotDTO["tournament_block"],
  hasChanges: boolean
) {
  if (classBlock && tournamentBlock) return "bg-violet-50 dark:bg-violet-950/30";
  if (classBlock) return "bg-sky-50 dark:bg-sky-950/30";
  if (tournamentBlock) return "bg-amber-50 dark:bg-amber-950/30";
  if (hasChanges) return "bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-l-yellow-500";
  return "";
}

function OccupancyNote({
  classBlock,
  tournamentBlock,
}: {
  classBlock: CourtSlotDTO["class_block"];
  tournamentBlock: CourtSlotDTO["tournament_block"];
}) {
  if (!classBlock && !tournamentBlock) return null;
  return (
    <div className="space-y-1 text-sm font-medium">
      {classBlock ? (
        <p className="text-sky-950 dark:text-sky-100">Clase · {classBlock.label}</p>
      ) : null}
      {tournamentBlock ? (
        <p className="text-amber-950 dark:text-amber-100">Torneo · {tournamentBlock.label}</p>
      ) : null}
    </div>
  );
}

export function CourtSlotCard({
  slot,
  paymentMethods,
  players,
  balances,
  playersReady,
  onUpdate,
  onSave,
  onCancel,
  hasChanges,
  isSaving,
  readOnly = false,
  reservationLabel = null,
}: CourtSlotRowProps) {
  const classBlock = slot.class_block;
  const tournamentBlock = slot.tournament_block;
  const occupied = Boolean(classBlock || tournamentBlock);

  return (
    <div className={`rounded-lg border p-3 ${slotTone(classBlock, tournamentBlock, hasChanges)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${courtPillClasses(slot.court?.id)}`}
          >
            {slot.court?.name ?? "-"}
          </span>
          <div className="mt-1 text-sm font-medium">
            {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
          </div>
          <div className="text-xs text-muted-foreground">{formatSlotDate(slot.slot_date)}</div>
          {reservationLabel ? <div className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">{reservationLabel}</div> : null}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <Checkbox
            checked={slot.was_played}
            disabled={readOnly || occupied}
            onCheckedChange={(checked) =>
              onUpdate(slot.id, { was_played: Boolean(checked) })
            }
          />
          Jugado
        </label>
      </div>

      {occupied ? (
        <div className="mt-3">
          <OccupancyNote classBlock={classBlock} tournamentBlock={tournamentBlock} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <SeatEditors
            slot={slot}
            paymentMethods={paymentMethods}
            players={players}
            balances={balances}
            disabled={readOnly}
            playersReady={playersReady}
            showLabel
            onUpdate={onUpdate}
          />
        </div>
      )}

      {hasChanges && !readOnly && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="default" onClick={onSave} disabled={isSaving} className="flex-1">
            {isSaving ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <SaveIcon className="mr-1 h-4 w-4" />
                Guardar
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function CourtSlotRow({
  slot,
  paymentMethods,
  players,
  balances,
  playersReady,
  onUpdate,
  onSave,
  onCancel,
  hasChanges,
  isSaving,
  readOnly = false,
  reservationLabel = null,
}: CourtSlotRowProps) {
  const classBlock = slot.class_block;
  const tournamentBlock = slot.tournament_block;
  const occupied = Boolean(classBlock || tournamentBlock);
  return (
    <TableRow 
      key={slot.id}
      className={slotTone(classBlock, tournamentBlock, hasChanges)}
    >
      <TableCell className="text-center">
        <Checkbox
          checked={slot.was_played}
          disabled={readOnly || occupied}
          onCheckedChange={(checked) =>
            onUpdate(slot.id, {
              was_played: Boolean(checked),
            })
          }
        />
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${courtPillClasses(slot.court?.id)}`}
        >
          {slot.court?.name ?? "-"}
        </span>
      </TableCell>
      <TableCell>
        {formatSlotDate(slot.slot_date)}
      </TableCell>
      <TableCell>
        <div>{formatTime(slot.start_time)} - {formatTime(slot.end_time)}</div>
        {reservationLabel ? <div className="text-xs text-indigo-700 dark:text-indigo-300">{reservationLabel}</div> : null}
      </TableCell>

      {occupied ? (
        <TableCell colSpan={4}>
          <OccupancyNote classBlock={classBlock} tournamentBlock={tournamentBlock} />
        </TableCell>
      ) : (
      <>
      <SeatEditors
        slot={slot}
        paymentMethods={paymentMethods}
        players={players}
        balances={balances}
        disabled={readOnly}
        playersReady={playersReady}
        showLabel={false}
        asCells
        onUpdate={onUpdate}
      />
      </>
      )}

      <TableCell>
        {hasChanges && !readOnly && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="default"
              onClick={onSave}
              disabled={isSaving}
              className="flex-1"
            >
              {isSaving ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <SaveIcon className="h-4 w-4 mr-1" />
                  Guardar
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

