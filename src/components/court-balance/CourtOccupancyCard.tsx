import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CourtOccupancy } from "@/lib/court-occupancy";

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function percent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

export function CourtOccupancyCard({
  occupancy,
  title = "Ocupación",
}: {
  occupancy: CourtOccupancy | null | undefined;
  title?: string;
}) {
  if (!occupancy) return null;
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          De {occupancy.startTime} a {occupancy.endTime}. Turnos, clases y torneos ocupan; el resto queda libre.
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Índice</p>
        <p className="text-lg font-semibold">{percent(occupancy.percent)}</p>
        <p className="text-xs text-muted-foreground">
          {duration(occupancy.usedMinutes)} ocupadas de {duration(occupancy.availableMinutes)}
        </p>
      </div>
      {occupancy.courts.length > 0 && (
        <>
          <div className="space-y-2 md:hidden">
            {occupancy.courts.map((court) => (
              <div key={court.courtId} className="rounded-lg border p-3">
                <p className="font-medium">{court.courtName}</p>
                <p className="text-sm">{percent(court.percent)}</p>
                <p className="text-xs text-muted-foreground">
                  {duration(court.usedMinutes)} ocupadas · {duration(court.availableMinutes - court.usedMinutes)} libres
                </p>
              </div>
            ))}
          </div>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cancha</TableHead>
                  <TableHead className="text-right">Ocupado</TableHead>
                  <TableHead className="text-right">Libre</TableHead>
                  <TableHead className="text-right">Índice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occupancy.courts.map((court) => (
                  <TableRow key={court.courtId}>
                    <TableCell>{court.courtName}</TableCell>
                    <TableCell className="text-right">{duration(court.usedMinutes)}</TableCell>
                    <TableCell className="text-right">{duration(court.availableMinutes - court.usedMinutes)}</TableCell>
                    <TableCell className="text-right">{percent(court.percent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
