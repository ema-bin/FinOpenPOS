"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, MessageCircleIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ordersService } from "@/services";
import type { OrderDTO } from "@/models/dto/order";
import {
  buildDebtReminderMessage,
  computeDebtSummary,
  formatDebtAmount,
} from "@/lib/debt-reminder-message";
import { buildWhatsAppUrl, defaultWhatsAppLinkTarget } from "@/lib/whatsapp";

type DebtReminderDialogProps = {
  order: OrderDTO | null;
  onOpenChange: (open: boolean) => void;
};

export function DebtReminderDialog({ order, onOpenChange }: DebtReminderDialogProps) {
  const open = order != null;
  const [includeDetail, setIncludeDetail] = useState(true);
  const [message, setMessage] = useState("");

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ["order", order?.id],
    queryFn: () => ordersService.getById(order!.id),
    enabled: open,
    staleTime: 1000 * 30,
  });

  const source = detail ?? order;

  useEffect(() => {
    if (!source) return;
    setMessage(buildDebtReminderMessage(source, { includeDetail }));
  }, [source, includeDetail]);

  const phone = source?.player?.phone ?? null;
  const whatsappUrl = useMemo(
    () => buildWhatsAppUrl(phone, message, defaultWhatsAppLinkTarget()),
    [phone, message]
  );

  const balance = source ? computeDebtSummary(source).balance : 0;
  const clientName = source?.player
    ? `${source.player.first_name} ${source.player.last_name}`.trim()
    : "Cliente";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recordatorio de deuda</DialogTitle>
          <DialogDescription>
            {clientName} · Cuenta #{order?.id} · Saldo pendiente{" "}
            <strong>{formatDebtAmount(balance)}</strong>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {isError ? (
              <p className="text-sm text-destructive">
                No se pudo cargar el detalle de la cuenta. Se usa el total del listado.
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox
                id="debt-reminder-include-detail"
                checked={includeDetail}
                onCheckedChange={(checked) => setIncludeDetail(checked === true)}
              />
              <Label htmlFor="debt-reminder-include-detail" className="cursor-pointer">
                Incluir detalle de lo que debe
              </Label>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="debt-reminder-message">Mensaje</Label>
              <Textarea
                id="debt-reminder-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Podés editar el texto antes de enviarlo. Cambiar la opción de detalle regenera el mensaje.
              </p>
            </div>

            {!whatsappUrl ? (
              <p className="text-sm text-destructive">
                {phone?.trim()
                  ? `El teléfono "${phone}" no es válido para WhatsApp.`
                  : "El cliente no tiene teléfono cargado."}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {whatsappUrl && !isLoading ? (
            <Button type="button" asChild>
              <a href={whatsappUrl} onClick={() => onOpenChange(false)}>
                <MessageCircleIcon className="h-4 w-4 mr-2" />
                Enviar WhatsApp
              </a>
            </Button>
          ) : (
            <Button type="button" disabled>
              <MessageCircleIcon className="h-4 w-4 mr-2" />
              Enviar WhatsApp
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
