"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlayerSearchSelect } from "@/components/player-search-select/PlayerSearchSelect";
import { usePermissions } from "@/components/permissions-provider";
import { paymentMethodsService, playersService, slotCreditsService } from "@/services";
import { methodConsumesCredit } from "@/lib/slot-credits";
import type { SlotCreditPlayerRow } from "@/repositories/slot-credits.repository";

const KIND_LABEL: Record<string, string> = {
  grant: "Alta",
  consume: "Uso",
  refund: "Devolución",
  adjustment: "Ajuste",
};

function fullName(player: { first_name: string; last_name: string }) {
  return `${player.first_name} ${player.last_name}`.trim();
}

function money(value: number) {
  return `$${value.toLocaleString("es-AR")}`;
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function SlotPacksPage() {
  const queryClient = useQueryClient();
  const { can, loading: permsLoading } = usePermissions();
  const canWrite = !permsLoading && can("courts.operate");
  const [search, setSearch] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [name, setName] = useState("Pack 10");
  const [credits, setCredits] = useState("10");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("none");
  const [soldAt, setSoldAt] = useState(today);
  const [notes, setNotes] = useState("");
  const [historyPlayer, setHistoryPlayer] = useState<SlotCreditPlayerRow | null>(null);
  const [adjustPlayer, setAdjustPlayer] = useState<SlotCreditPlayerRow | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const { data: players = [] } = useQuery({
    queryKey: ["players", "onlyActive"],
    queryFn: () => playersService.getAll("active"),
  });
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["payment-methods", "COURT"],
    queryFn: () => paymentMethodsService.getAll(true, "COURT"),
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["slot-packs"],
    queryFn: () => slotCreditsService.listPlayers(),
  });
  const historyQuery = useQuery({
    queryKey: ["slot-credit-movements", historyPlayer?.player_id],
    queryFn: () => slotCreditsService.movements(historyPlayer!.player_id),
    enabled: historyPlayer != null,
  });

  const cashMethods = paymentMethods.filter((method) => !methodConsumesCredit(method));
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => fullName(row).toLowerCase().includes(term));
  }, [rows, search]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["slot-packs"] });
    queryClient.invalidateQueries({ queryKey: ["slot-credits"] });
    if (historyPlayer) {
      queryClient.invalidateQueries({
        queryKey: ["slot-credit-movements", historyPlayer.player_id],
      });
    }
  };

  const grantMutation = useMutation({
    mutationFn: () =>
      slotCreditsService.grant({
        player_id: playerId!,
        name,
        credits: Number(credits),
        amount_paid: amount.trim() === "" ? 0 : Number(amount),
        payment_method_id: paymentMethodId === "none" ? null : Number(paymentMethodId),
        sold_at: soldAt,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Pack asignado.");
      setNotes("");
      refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo asignar el pack");
    },
  });

  const adjustMutation = useMutation({
    mutationFn: () =>
      slotCreditsService.adjust({
        player_id: adjustPlayer!.player_id,
        delta: Number(delta),
        reason,
      }),
    onSuccess: () => {
      toast.success("Saldo ajustado.");
      setAdjustPlayer(null);
      setDelta("");
      setReason("");
      refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo ajustar el saldo");
    },
  });

  const submitPack = () => {
    if (!playerId) {
      toast.error("Elegí un jugador");
      return;
    }
    grantMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6 max-md:p-3">
        <CardHeader className="space-y-1 p-0">
          <CardTitle>Packs de turnos</CardTitle>
          <CardDescription>
            Un crédito es una participación de un jugador. El importe queda en el
            pack y no se suma otra vez cuando se usa el QR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-0 pt-4">
          {canWrite ? (
            <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Jugador</Label>
                <PlayerSearchSelect
                  players={players}
                  value={playerId}
                  onValueChange={setPlayerId}
                  placeholder="Buscar jugador..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pack-name">Pack</Label>
                <Input id="pack-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pack-credits">Créditos</Label>
                <Input
                  id="pack-credits"
                  inputMode="numeric"
                  value={credits}
                  onChange={(event) => setCredits(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pack-amount">Importe cobrado</Label>
                <Input
                  id="pack-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>Medio de cobro</Label>
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin especificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {cashMethods.map((method) => (
                      <SelectItem key={method.id} value={String(method.id)}>
                        {method.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pack-date">Fecha</Label>
                <Input id="pack-date" type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="pack-notes">Nota</Label>
                <Textarea id="pack-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={submitPack} disabled={grantMutation.isPending}>
                  {grantMutation.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Asignar pack"}
                </Button>
              </div>
            </div>
          ) : null}

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar jugador..."
          />

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="h-5 w-5 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay packs asignados.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {visible.map((row) => (
                  <PlayerCard
                    key={row.player_id}
                    row={row}
                    canWrite={canWrite}
                    onHistory={() => setHistoryPlayer(row)}
                    onAdjust={() => setAdjustPlayer(row)}
                  />
                ))}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jugador</TableHead>
                      <TableHead>Saldo</TableHead>
                      <TableHead>Packs</TableHead>
                      <TableHead className="w-40">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => (
                      <TableRow key={row.player_id}>
                        <TableCell>
                          <div className="font-medium">{fullName(row)}</div>
                          {row.phone ? (
                            <div className="text-xs text-muted-foreground">{row.phone}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.balance}</TableCell>
                        <TableCell>
                          <PackList packs={row.packs} />
                        </TableCell>
                        <TableCell>
                          <RowActions
                            canWrite={canWrite}
                            onHistory={() => setHistoryPlayer(row)}
                            onAdjust={() => setAdjustPlayer(row)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={historyPlayer != null} onOpenChange={(open) => !open && setHistoryPlayer(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Historial{historyPlayer ? ` · ${fullName(historyPlayer)}` : ""}
            </DialogTitle>
          </DialogHeader>
          {historyQuery.isLoading ? (
            <Loader2Icon className="h-5 w-5 animate-spin" />
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay movimientos.</p>
          ) : (
            <div className="space-y-2">
              {(historyQuery.data ?? []).map((movement) => (
                <div key={movement.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>{KIND_LABEL[movement.kind] ?? movement.kind}</span>
                    <span className={movement.delta < 0 ? "text-destructive" : "text-emerald-700"}>
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(movement.created_at).toLocaleString("es-AR")}
                    {movement.pack_name ? ` · ${movement.pack_name}` : ""}
                  </p>
                  {movement.slot_label ? <p className="text-xs">{movement.slot_label}</p> : null}
                  {movement.reason ? <p className="text-xs">{movement.reason}</p> : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={adjustPlayer != null}
        onOpenChange={(open) => {
          if (!open) {
            setAdjustPlayer(null);
            setDelta("");
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ajustar saldo{adjustPlayer ? ` · ${fullName(adjustPlayer)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Saldo actual: {adjustPlayer?.balance ?? 0}
          </p>
          <div className="space-y-1">
            <Label htmlFor="adjust-delta">Créditos (negativo para descontar)</Label>
            <Input
              id="adjust-delta"
              inputMode="numeric"
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-reason">Motivo</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => adjustMutation.mutate()}
              disabled={adjustMutation.isPending || !adjustPlayer}
            >
              {adjustMutation.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Guardar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackList({ packs }: { packs: SlotCreditPlayerRow["packs"] }) {
  if (packs.length === 0) return <span className="text-sm text-muted-foreground">Sin packs</span>;
  return (
    <div className="space-y-1 text-sm">
      {packs.map((pack) => (
        <p key={pack.id}>
          {pack.name}: {pack.remaining} de {pack.credits}
          {pack.amount_paid > 0 ? ` · ${money(pack.amount_paid)}` : ""}
          {pack.payment_method_name ? ` · ${pack.payment_method_name}` : ""}
        </p>
      ))}
    </div>
  );
}

function RowActions({
  canWrite,
  onHistory,
  onAdjust,
}: {
  canWrite: boolean;
  onHistory: () => void;
  onAdjust: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={onHistory}>
        Historial
      </Button>
      {canWrite ? (
        <Button size="sm" variant="outline" onClick={onAdjust}>
          Ajustar
        </Button>
      ) : null}
    </div>
  );
}

function PlayerCard({
  row,
  canWrite,
  onHistory,
  onAdjust,
}: {
  row: SlotCreditPlayerRow;
  canWrite: boolean;
  onHistory: () => void;
  onAdjust: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{fullName(row)}</p>
          {row.phone ? <p className="text-xs text-muted-foreground">{row.phone}</p> : null}
        </div>
        <p className="text-sm font-semibold">{row.balance} créditos</p>
      </div>
      <PackList packs={row.packs} />
      <RowActions canWrite={canWrite} onHistory={onHistory} onAdjust={onAdjust} />
    </div>
  );
}
