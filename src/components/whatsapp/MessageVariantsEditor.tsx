"use client";

import { useState, type ReactNode } from "react";
import { Loader2Icon, PlusIcon, SaveIcon, ShuffleIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WhatsAppMessageVariantsState } from "@/hooks/use-whatsapp-message-variants";
import { TEMPLATE_NAME_MAX_LENGTH } from "@/lib/whatsapp-message-variants";

type MessageVariantsEditorProps = {
  state: WhatsAppMessageVariantsState;
  id: string;
  label: string;
  hint?: ReactNode;
  rows?: number;
  placeholder?: string;
};

export function MessageVariantsEditor({
  state,
  id,
  label,
  hint,
  rows = 5,
  placeholder,
}: MessageVariantsEditorProps) {
  const [newName, setNewName] = useState<string | null>(null);
  const { variants, selected } = state;

  const handleCreate = async () => {
    if (!newName?.trim()) return;
    try {
      await state.saveAsNew(newName.trim());
      setNewName(null);
    } catch {
      // toast ya mostrado por la mutación
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`¿Eliminar la variante "${selected.name}"?`)) return;
    state.remove(selected.id);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex flex-wrap items-center gap-2">
        {state.isLoading ? (
          <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : variants.length > 0 ? (
          <Select
            value={selected ? String(selected.id) : undefined}
            onValueChange={(value) => state.select(Number(value))}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Elegí una variante" />
            </SelectTrigger>
            <SelectContent>
              {variants.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">
            {state.isError
              ? "No se pudieron cargar las variantes guardadas."
              : "Sin variantes guardadas: se usa el mensaje por defecto."}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={state.pickRandom}
          disabled={variants.length < 2}
          title="Elegir otra variante al azar"
        >
          <ShuffleIcon className="h-4 w-4 mr-1" />
          Al azar
        </Button>
      </div>

      <Textarea
        id={id}
        rows={rows}
        value={state.text}
        onChange={(e) => state.setDraft(e.target.value)}
        placeholder={placeholder}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={state.saveChanges}
          disabled={!selected || !state.isDirty || state.isSaving}
        >
          <SaveIcon className="h-4 w-4 mr-1" />
          Guardar cambios
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setNewName(`Variante ${variants.length + 1}`)}
          disabled={!state.text.trim() || state.isSaving}
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          Guardar como nueva
        </Button>
        {state.isDirty ? (
          <Button type="button" variant="ghost" size="sm" onClick={state.discardDraft}>
            Descartar cambios
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={!selected || state.isDeleting}
        >
          <Trash2Icon className="h-4 w-4 mr-1" />
          Eliminar
        </Button>
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      <div className="flex items-center gap-2 pt-1">
        <Switch
          id={`${id}-rotate`}
          checked={state.rotate}
          onCheckedChange={state.setRotate}
          disabled={variants.length < 2}
        />
        <Label htmlFor={`${id}-rotate`} className="text-sm font-normal">
          Rotar variantes al azar en cada envío
        </Label>
      </div>
      {state.rotate ? (
        <p className="text-xs text-muted-foreground">
          Próximo envío: <strong>{state.activeTemplate.name ?? "—"}</strong>. Cada vez que
          enviás pasa a otra de las {variants.length} variantes guardadas, sin repetir hasta
          completar la vuelta (los cambios sin guardar no se usan).
        </p>
      ) : null}

      <Dialog open={newName != null} onOpenChange={(open) => !open && setNewName(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva variante</DialogTitle>
            <DialogDescription>
              Se guarda el texto actual del editor como una variante nueva.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${id}-new-name`}>Nombre</Label>
            <Input
              id={`${id}-new-name`}
              value={newName ?? ""}
              maxLength={TEMPLATE_NAME_MAX_LENGTH}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewName(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!newName?.trim() || state.isSaving}
            >
              {state.isSaving ? <Loader2Icon className="h-4 w-4 mr-1 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
