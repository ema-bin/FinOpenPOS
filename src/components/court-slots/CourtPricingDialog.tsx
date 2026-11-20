"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { courtSlotsService } from "@/services/court-slots.service";
import type { CourtPricingDB } from "@/models/db/court";
import { ORIGINAL_TARIFF_FROM } from "@/lib/court-pricing-history";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface PricingRule {
  start_time: string;
  end_time: string;
  price_per_player: number;
}

interface Court {
  id: number;
  name: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function historyLabel(row: CourtPricingDB) {
  const until = row.valid_until ? formatDay(row.valid_until) : "";
  if (!row.valid_from || row.valid_from.slice(0, 10) === ORIGINAL_TARIFF_FROM) {
    return `Hasta el ${until}`;
  }
  return `Del ${formatDay(row.valid_from)} al ${until}`;
}

interface CourtPricingDialogProps {
  court: Court;
  onUpdate?: () => void;
}

export function CourtPricingDialog({
  court,
  onUpdate,
}: CourtPricingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [history, setHistory] = useState<CourtPricingDB[]>([]);
  const [validFrom, setValidFrom] = useState("");

  useEffect(() => {
    if (open) {
      setValidFrom("");
      loadPricing();
    }
  }, [open, court.id]);

  async function loadPricing() {
    try {
      setLoading(true);
      const [pricing, past] = await Promise.all([
        courtSlotsService.getPricing(),
        courtSlotsService.getPricingHistory(court.id),
      ]);
      setHistory(past);
      const courtPricing = pricing.filter((p) => p.court_id === court.id);
      
      if (courtPricing.length > 0) {
        setRules(
          courtPricing.map((p) => ({
            start_time: p.start_time.slice(0, 5), // HH:MM
            end_time: p.end_time.slice(0, 5),
            price_per_player: p.price_per_player,
          }))
        );
      } else {
        // Valores por defecto vacíos - el usuario debe configurarlos
        setRules([]);
      }
    } catch (error) {
      toast.error("Error al cargar precios");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!DATE.test(validFrom)) {
      toast.error("Elegí el día a partir del cual cambia la tarifa.");
      return;
    }
    try {
      setSaving(true);
      await courtSlotsService.upsertPricingForCourtId(court.id, rules, validFrom);
      toast.success("Tarifa guardada");
      setOpen(false);
      onUpdate?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al guardar los precios"
      );
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    setRules([
      ...rules,
      { start_time: "13:00", end_time: "23:30", price_per_player: 0 },
    ]);
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: keyof PricingRule, value: string | number) {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    setRules(updated);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Configurar {court.name}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Precios por jugador - {court.name}</DialogTitle>
          <DialogDescription>
            Elegí el día a partir del cual cambia la tarifa de {court.name}. Desde esa fecha se cobra el precio nuevo. Los días anteriores conservan el anterior.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">A partir del</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </div>
            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div
                  key={index}
                  className="flex gap-2 items-end p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <Label className="text-xs">Desde</Label>
                    <Input
                      type="time"
                      value={rule.start_time}
                      onChange={(e) =>
                        updateRule(index, "start_time", e.target.value)
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Hasta</Label>
                    <Input
                      type="time"
                      value={rule.end_time}
                      onChange={(e) =>
                        updateRule(index, "end_time", e.target.value)
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Precio por jugador</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rule.price_per_player}
                      onChange={(e) =>
                        updateRule(
                          index,
                          "price_per_player",
                          parseFloat(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRule(index)}
                    disabled={rules.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {rules.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay precios configurados. Agregá al menos un rango horario.
              </p>
            )}

            <Button
              variant="outline"
              onClick={addRule}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar rango horario
            </Button>

            {history.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-semibold">Tarifas anteriores</h3>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {history.map((row) => (
                    <p key={row.id}>
                      {historyLabel(row)} · {row.start_time.slice(0, 5)} a {row.end_time.slice(0, 5)} · $
                      {Number(row.price_per_player).toLocaleString("es-AR")}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || rules.length === 0 || !DATE.test(validFrom)}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
