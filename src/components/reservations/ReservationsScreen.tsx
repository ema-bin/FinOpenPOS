"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/components/permissions-provider";
import { ReservationsCalendar } from "@/components/reservations/ReservationsCalendar";
import { FixedBookingsTab } from "@/components/reservations/FixedBookingsTab";

export function ReservationsScreen() {
  const { can, loading } = usePermissions();
  const canWrite = !loading && can("courts.operate");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reservas</h1>
        <p className="text-sm text-muted-foreground">
          Reservá un turno o administrá los turnos fijos. Reservar no marca el turno como jugado ni como pago.
        </p>
      </div>
      <Tabs defaultValue="calendar">
        <TabsList className="max-md:grid max-md:h-auto max-md:w-full max-md:grid-cols-2">
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="fixed">Turnos fijos</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4">
          <ReservationsCalendar canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="fixed" className="mt-4">
          <FixedBookingsTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
