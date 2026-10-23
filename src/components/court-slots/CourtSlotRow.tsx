import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SaveIcon, Loader2Icon, XIcon } from "lucide-react";
import { courtPillClasses, formatTime } from "@/lib/court-slots-utils";
import { PlayerPaymentSelect } from "./PlayerPaymentSelect";
import type { CourtSlotDTO } from "@/models/dto/court";
import type { PaymentMethodDTO } from "@/models/dto/payment-method";
import type { CourtSlotDB } from "@/models/db/court";

type SlotChanges = Partial<
  Pick<
    CourtSlotDB,
    | "was_played"
    | "notes"
    | "player1_payment_method_id"
    | "player1_note"
    | "player2_payment_method_id"
    | "player2_note"
    | "player3_payment_method_id"
    | "player3_note"
    | "player4_payment_method_id"
    | "player4_note"
  >
>;

interface CourtSlotRowProps {
  slot: CourtSlotDTO;
  paymentMethods: PaymentMethodDTO[];
  onUpdate: (slotId: number, patch: SlotChanges) => void;
  onSave: () => void;
  onCancel: () => void;
  hasChanges: boolean;
  isSaving: boolean;
}

function formatSlotDate(slotDate: string) {
  const [year, month, day] = slotDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return format(date, "EEEE dd/MM/yyyy", { locale: es }).toUpperCase();
}

function slotTone(classBlock: CourtSlotDTO["class_block"], hasChanges: boolean) {
  if (classBlock) return "bg-sky-50 dark:bg-sky-950/30";
  if (hasChanges) return "bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-l-yellow-500";
  return "";
}

export function CourtSlotCard({
  slot,
  paymentMethods,
  onUpdate,
  onSave,
  onCancel,
  hasChanges,
  isSaving,
}: CourtSlotRowProps) {
  const classBlock = slot.class_block;

  return (
    <div className={`rounded-lg border p-3 ${slotTone(classBlock, hasChanges)}`}>
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
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <Checkbox
            checked={slot.was_played}
            disabled={Boolean(classBlock)}
            onCheckedChange={(checked) =>
              onUpdate(slot.id, { was_played: Boolean(checked) })
            }
          />
          Jugado
        </label>
      </div>

      {classBlock ? (
        <p className="mt-3 text-sm font-medium text-sky-950 dark:text-sky-100">
          Clase · {classBlock.label}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {([
            ["Jugador 1", slot.player1_payment_method?.id, "player1_payment_method_id"],
            ["Jugador 2", slot.player2_payment_method?.id, "player2_payment_method_id"],
            ["Jugador 3", slot.player3_payment_method?.id, "player3_payment_method_id"],
            ["Jugador 4", slot.player4_payment_method?.id, "player4_payment_method_id"],
          ] as const).map(([label, methodId, field]) => (
            <div key={field} className="space-y-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <PlayerPaymentSelect
                value={slot.was_played ? methodId : null}
                onChange={(value) => onUpdate(slot.id, { [field]: value })}
                paymentMethods={paymentMethods}
                disabled={!slot.was_played}
              />
            </div>
          ))}
        </div>
      )}

      {hasChanges && (
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
  onUpdate,
  onSave,
  onCancel,
  hasChanges,
  isSaving,
}: CourtSlotRowProps) {
  const classBlock = slot.class_block;
  return (
    <TableRow 
      key={slot.id}
      className={slotTone(classBlock, hasChanges)}
    >
      <TableCell className="text-center">
        <Checkbox
          checked={slot.was_played}
          disabled={Boolean(classBlock)}
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
        {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
      </TableCell>

      {classBlock ? (
        <TableCell colSpan={4} className="text-sm font-medium text-sky-950 dark:text-sky-100">
          Clase · {classBlock.label}
        </TableCell>
      ) : (
      <>
      <TableCell className="min-w-[160px]">
        <PlayerPaymentSelect
          value={slot.was_played ? slot.player1_payment_method?.id : null}
          onChange={(value) =>
            onUpdate(slot.id, {
              player1_payment_method_id: value,
            })
          }
          paymentMethods={paymentMethods}
          disabled={!slot.was_played}
        />
      </TableCell>

      <TableCell className="min-w-[160px]">
        <PlayerPaymentSelect
          value={slot.was_played ? slot.player2_payment_method?.id : null}
          onChange={(value) =>
            onUpdate(slot.id, {
              player2_payment_method_id: value,
            })
          }
          paymentMethods={paymentMethods}
          disabled={!slot.was_played}
        />
      </TableCell>

      <TableCell className="min-w-[160px]">
        <PlayerPaymentSelect
          value={slot.was_played ? slot.player3_payment_method?.id : null}
          onChange={(value) =>
            onUpdate(slot.id, {
              player3_payment_method_id: value,
            })
          }
          paymentMethods={paymentMethods}
          disabled={!slot.was_played}
        />
      </TableCell>

      <TableCell className="min-w-[160px]">
        <PlayerPaymentSelect
          value={slot.was_played ? slot.player4_payment_method?.id : null}
          onChange={(value) =>
            onUpdate(slot.id, {
              player4_payment_method_id: value,
            })
          }
          paymentMethods={paymentMethods}
          disabled={!slot.was_played}
        />
      </TableCell>
      </>
      )}

      <TableCell>
        {hasChanges && (
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

