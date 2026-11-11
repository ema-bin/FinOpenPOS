"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/components/permissions-provider";
import { PackDefinitionsTab } from "@/components/slot-packs/PackDefinitionsTab";
import { SellPackTab } from "@/components/slot-packs/SellPackTab";
import { PlayerCreditsTab } from "@/components/slot-packs/PlayerCreditsTab";

export default function SlotPacksPage() {
  const { can, loading: permsLoading } = usePermissions();
  const canWrite = !permsLoading && can("courts.operate");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Packs de turnos</h1>
        <p className="text-sm text-muted-foreground">
          Definí los packs, vendelos a un jugador y consultá los créditos que le quedan.
        </p>
      </div>
      <Tabs defaultValue="definitions">
        <TabsList className="max-md:grid max-md:h-auto max-md:w-full max-md:grid-cols-3">
          <TabsTrigger className="max-md:px-2" value="definitions">
            Packs
          </TabsTrigger>
          <TabsTrigger className="max-md:px-2" value="sell">
            Vender
          </TabsTrigger>
          <TabsTrigger className="max-md:px-2" value="credits">
            Créditos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="definitions" className="mt-4">
          <PackDefinitionsTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="sell" className="mt-4">
          <SellPackTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="credits" className="mt-4">
          <PlayerCreditsTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
