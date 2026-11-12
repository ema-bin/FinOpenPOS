"use client";

import { TableCell } from "@/components/ui/table";
import { PlayerPaymentSelect } from "./PlayerPaymentSelect";
import { PlayerSearchSelect } from "@/components/player-search-select/PlayerSearchSelect";
import { methodConsumesCredit } from "@/lib/slot-credits";
import type { CourtSlotDTO } from "@/models/dto/court";
import type { PaymentMethodDTO } from "@/models/dto/payment-method";
import type { PlayerDTO } from "@/models/dto/player";
import type { CourtSlotDB } from "@/models/db/court";

export type SlotChanges = Partial<
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
    | "player1_id"
    | "player2_id"
    | "player3_id"
    | "player4_id"
  >
>;

const SEATS = [
  {
    label: "Jugador 1",
    methodKey: "player1_payment_method_id",
    playerKey: "player1_id",
    methodField: "player1_payment_method",
    playerField: "player1",
  },
  {
    label: "Jugador 2",
    methodKey: "player2_payment_method_id",
    playerKey: "player2_id",
    methodField: "player2_payment_method",
    playerField: "player2",
  },
  {
    label: "Jugador 3",
    methodKey: "player3_payment_method_id",
    playerKey: "player3_id",
    methodField: "player3_payment_method",
    playerField: "player3",
  },
  {
    label: "Jugador 4",
    methodKey: "player4_payment_method_id",
    playerKey: "player4_id",
    methodField: "player4_payment_method",
    playerField: "player4",
  },
] as const;

function playerOption(player: { id: number; first_name: string; last_name: string }): PlayerDTO {
  return {
    id: player.id,
    first_name: player.first_name,
    last_name: player.last_name,
    phone: null,
    email: null,
    city: null,
    birth_date: null,
    notes: null,
    status: "active",
    category_id: null,
    category: null,
    female_category_id: null,
    female_category: null,
    gender: null,
  };
}

function SeatEditor({
  label,
  methodId,
  playerId,
  knownPlayer,
  paymentMethods,
  players,
  balance,
  disabled,
  playersReady,
  showLabel,
  onChange,
}: {
  label: string;
  methodId: number | null | undefined;
  playerId: number | null;
  knownPlayer: { id: number; first_name: string; last_name: string } | null;
  paymentMethods: PaymentMethodDTO[];
  players: PlayerDTO[];
  balance: number | undefined;
  disabled: boolean;
  playersReady: boolean;
  showLabel: boolean;
  onChange: (patch: { methodId: number | null; playerId: number | null }) => void;
}) {
  const method = paymentMethods.find((item) => item.id === methodId) ?? null;
  const consumes = methodConsumesCredit(method);
  const options =
    knownPlayer && !players.some((item) => item.id === knownPlayer.id)
      ? [playerOption(knownPlayer), ...players]
      : players;

  return (
    <div className="space-y-1">
      {showLabel ? <span className="text-xs text-muted-foreground">{label}</span> : null}
      <PlayerPaymentSelect
        value={methodId}
        onChange={(value) => {
          const next = paymentMethods.find((item) => item.id === value) ?? null;
          onChange({
            methodId: value,
            playerId: methodConsumesCredit(next) ? playerId : null,
          });
        }}
        paymentMethods={paymentMethods}
        disabled={disabled}
      />
      {consumes ? (
        <>
          <PlayerSearchSelect
            players={options}
            value={playerId}
            onValueChange={(value) => onChange({ methodId: methodId ?? null, playerId: value })}
            placeholder={playersReady ? "Buscar jugador..." : "Cargando créditos..."}
            searchPlaceholder="Nombre o apellido..."
            emptyMessage="Ningún jugador con créditos."
            disabled={disabled || !playersReady}
          />
          {playerId != null ? (
            <p className={`text-[11px] ${balance === 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {balance == null ? "Cargando saldo..." : `${balance} créditos`}
            </p>
          ) : (
            <p className="text-[11px] text-destructive">Elegí un jugador con créditos</p>
          )}
        </>
      ) : null}
    </div>
  );
}

export function SeatEditors({
  slot,
  paymentMethods,
  players,
  balances,
  disabled,
  playersReady,
  showLabel,
  asCells = false,
  onUpdate,
}: {
  slot: CourtSlotDTO;
  paymentMethods: PaymentMethodDTO[];
  players: PlayerDTO[];
  balances: ReadonlyMap<number, number>;
  disabled: boolean;
  playersReady: boolean;
  showLabel: boolean;
  asCells?: boolean;
  onUpdate: (slotId: number, patch: SlotChanges) => void;
}) {
  return (
    <>
      {SEATS.map((seat) => {
        const method = slot[seat.methodField];
        const player = slot[seat.playerField] ?? null;
        const playerId = slot[seat.playerKey] ?? player?.id ?? null;
        const editor = (
          <SeatEditor
            key={seat.playerKey}
            label={seat.label}
            methodId={slot.was_played ? method?.id : null}
            playerId={slot.was_played ? playerId : null}
            knownPlayer={player}
            paymentMethods={paymentMethods}
            players={players}
            balance={playerId == null ? undefined : balances.get(playerId)}
            disabled={disabled || !slot.was_played}
            playersReady={playersReady}
            showLabel={showLabel}
            onChange={(patch) =>
              onUpdate(slot.id, {
                [seat.methodKey]: patch.methodId,
                [seat.playerKey]: patch.playerId,
              })
            }
          />
        );
        if (!asCells) return editor;
        return (
          <TableCell key={seat.playerKey} className="min-w-[200px] align-top">
            {editor}
          </TableCell>
        );
      })}
    </>
  );
}
