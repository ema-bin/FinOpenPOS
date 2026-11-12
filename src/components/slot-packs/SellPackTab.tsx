"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerSearchSelect } from "@/components/player-search-select/PlayerSearchSelect";
import { paymentMethodsService, playersService, slotCreditsService } from "@/services";
import { methodConsumesCredit } from "@/lib/slot-credits";

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function SellPackTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [definitionId, setDefinitionId] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [soldAt, setSoldAt] = useState(today);
  const [notes, setNotes] = useState("");

  const { data: definitions = [] } = useQuery({
    queryKey: ["slot-pack-definitions"],
    queryFn: () => slotCreditsService.listDefinitions(),
  });
  const { data: players = [] } = useQuery({
    queryKey: ["players", "onlyActive"],
    queryFn: () => playersService.getAll("active"),
  });
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["payment-methods", "COURT"],
    queryFn: () => paymentMethodsService.getAll(true, "COURT"),
  });

  const activePacks = definitions.filter((definition) => definition.is_active);
  const cashMethods = paymentMethods.filter((method) => !methodConsumesCredit(method));

  const sellMutation = useMutation({
    mutationFn: () =>
      slotCreditsService.grant({
        player_id: playerId!,
        definition_id: Number(definitionId),
        amount_paid: amount.trim() === "" ? 0 : Number(amount),
        payment_method_id: Number(paymentMethodId),
        sold_at: soldAt,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Pack vendido. Los créditos ya están en el jugador.");
      setPlayerId(null);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["slot-packs"] });
      queryClient.invalidateQueries({ queryKey: ["slot-credits"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo vender el pack");
    },
  });

  if (!canWrite) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés permiso para vender packs.
      </p>
    );
  }

  return (
    <div className="grid max-w-xl gap-3">
      <div className="space-y-1">
        <Label>Pack</Label>
        <Select
          value={definitionId}
          onValueChange={(value) => {
            setDefinitionId(value);
            const pack = activePacks.find((item) => String(item.id) === value);
            setAmount(pack ? String(pack.price) : "");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Elegí un pack" />
          </SelectTrigger>
          <SelectContent>
            {activePacks.map((pack) => (
              <SelectItem key={pack.id} value={String(pack.id)}>
                {pack.name} · {pack.credits} turnos
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Jugador</Label>
        <PlayerSearchSelect
          players={players}
          value={playerId}
          onValueChange={setPlayerId}
          placeholder="Buscar jugador..."
        />
      </div>
      <div className="space-y-1">
        <Label>Cómo lo pagó</Label>
        <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
          <SelectTrigger>
            <SelectValue placeholder="Elegí un medio" />
          </SelectTrigger>
          <SelectContent>
            {cashMethods.map((method) => (
              <SelectItem key={method.id} value={String(method.id)}>
                {method.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sale-amount">Importe</Label>
        <Input
          id="sale-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sale-date">Fecha</Label>
        <Input id="sale-date" type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sale-notes">Nota</Label>
        <Textarea id="sale-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <div>
        <Button
          onClick={() => {
            if (!definitionId) {
              toast.error("Elegí un pack");
              return;
            }
            if (!playerId) {
              toast.error("Elegí un jugador");
              return;
            }
            if (!paymentMethodId) {
              toast.error("Elegí cómo lo pagó");
              return;
            }
            sellMutation.mutate();
          }}
          disabled={sellMutation.isPending || activePacks.length === 0}
        >
          {sellMutation.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Vender pack"}
        </Button>
      </div>
    </div>
  );
}
