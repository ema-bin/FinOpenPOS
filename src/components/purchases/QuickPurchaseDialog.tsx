"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon, ZapIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMethodNestedDTO } from "@/models/dto/payment-method";
import { purchasesService } from "@/services";
import { PaymentMethodSelector } from "@/components/payment-method-selector/PaymentMethodSelector";

type QuickPurchaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentMethods: PaymentMethodNestedDTO[];
  onCreated?: () => void | Promise<void>;
};

export function QuickPurchaseDialog({
  open,
  onOpenChange,
  paymentMethods,
  onCreated,
}: QuickPurchaseDialogProps) {
  const queryClient = useQueryClient();
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    number | "none"
  >("none");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setSelectedPaymentMethodId("none");
    setAmount("");
    setNotes("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (selectedPaymentMethodId === "none") {
        throw new Error("Seleccioná un método de pago");
      }
      const parsed = Number(String(amount).replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Ingresá un monto válido mayor a 0");
      }
      return purchasesService.quickPurchase({
        paymentMethodId: selectedPaymentMethodId,
        amount: parsed,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async (purchase) => {
      toast.success(`Compra #${purchase.id} registrada`);
      await onCreated?.();
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Error al registrar compra");
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next && !mutation.isPending) resetForm();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="h-5 w-5" />
            Compra rápida
          </DialogTitle>
          <DialogDescription>
            Registrá un gasto con método de pago y monto. Se crea automáticamente
            como compra al proveedor y producto &quot;Varios&quot; (completada).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="quick-purchase-amount">Monto</Label>
            <Input
              id="quick-purchase-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <PaymentMethodSelector
            paymentMethods={paymentMethods}
            selectedPaymentMethodId={selectedPaymentMethodId}
            onSelect={setSelectedPaymentMethodId}
            disabled={mutation.isPending}
            allowDeselect={false}
          />

          <div className="space-y-2">
            <Label htmlFor="quick-purchase-notes">Notas (opcional)</Label>
            <Input
              id="quick-purchase-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. supermercado, delivery..."
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              selectedPaymentMethodId === "none" ||
              !amount.trim()
            }
          >
            {mutation.isPending ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar compra"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
