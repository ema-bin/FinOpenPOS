"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfessorsTab } from "@/components/classes/ProfessorsTab";
import { CalendarTab } from "@/components/classes/CalendarTab";
import { ChargesTab } from "@/components/classes/ChargesTab";

export default function ClassesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Clases</h1>
        <p className="text-sm text-muted-foreground">
          Semana fija de lunes a domingo, de 06:00 a 00:00. El horario se elige al crear o editar la clase. El mes se usa para el cobro.
        </p>
      </div>
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="professors">Profesores</TabsTrigger>
          <TabsTrigger value="charges">Cobros</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="professors" className="mt-4">
          <ProfessorsTab />
        </TabsContent>
        <TabsContent value="charges" className="mt-4">
          <ChargesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
