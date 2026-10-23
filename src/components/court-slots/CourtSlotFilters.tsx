import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarIcon, RefreshCwIcon, Loader2Icon } from "lucide-react";

interface CourtSlotFiltersProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isRefreshing: boolean;
}

export function CourtSlotFilters({
  selectedDate,
  onDateChange,
  onRefresh,
  onGenerate,
  isGenerating,
  isRefreshing,
}: CourtSlotFiltersProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 max-md:flex-col max-md:items-stretch">
      <div className="flex flex-wrap items-end gap-4 max-md:w-full max-md:flex-col max-md:items-stretch">
        <div className="space-y-1 max-md:w-full">
          <Label className="flex items-center gap-1 text-xs">
            <CalendarIcon className="w-3 h-3" />
            Fecha
          </Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="max-md:w-full"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="max-md:w-full"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCwIcon className="w-4 h-4 mr-1" />
          {isRefreshing ? "Actualizando..." : "Refrescar"}
        </Button>
      </div>

      <Button className="max-md:w-full" onClick={onGenerate} disabled={isGenerating}>
        {isGenerating && (
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
        )}
        Generar turnos del día
      </Button>
    </div>
  );
}

