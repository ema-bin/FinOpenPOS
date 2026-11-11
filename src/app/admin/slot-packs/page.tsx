"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/components/permissions-provider";
import { PackDefinitionsTab } from "@/components/slot-packs/PackDefinitionsTab";
import { SellPackTab } from "@/components/slot-packs/SellPackTab";
import { PlayerCreditsTab } from "@/components/slot-packs/PlayerCreditsTab";

export default function SlotPacksPage() {
  const { can, canRead, loading: permsLoading } = usePermissions();
  const showDefine = canRead("packs.define");
  const showSell = canRead("packs.sell");
  const showCredits = canRead("packs.credits");
  const canWriteDefine = !permsLoading && can("packs.define");
  const canWriteSell = !permsLoading && can("packs.sell");
  const canWriteCredits = !permsLoading && can("packs.credits");
  const defaultTab = showDefine ? "definitions" : showSell ? "sell" : "credits";
  const visibleTabs = [showDefine, showSell, showCredits].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Packs de turnos</h1>
        <p className="text-sm text-muted-foreground">
          Definí los packs, vendelos a un jugador y consultá los créditos que le quedan.
        </p>
      </div>
      {permsLoading ? null : (
      <Tabs defaultValue={defaultTab}>
        <TabsList
          className={`max-md:grid max-md:h-auto max-md:w-full ${
            visibleTabs <= 1
              ? "max-md:grid-cols-1"
              : visibleTabs === 2
                ? "max-md:grid-cols-2"
                : "max-md:grid-cols-3"
          }`}
        >
          {showDefine ? (
            <TabsTrigger className="max-md:px-2" value="definitions">
              Packs
            </TabsTrigger>
          ) : null}
          {showSell ? (
            <TabsTrigger className="max-md:px-2" value="sell">
              Vender
            </TabsTrigger>
          ) : null}
          {showCredits ? (
            <TabsTrigger className="max-md:px-2" value="credits">
              Créditos
            </TabsTrigger>
          ) : null}
        </TabsList>
        {showDefine ? (
          <TabsContent value="definitions" className="mt-4">
            <PackDefinitionsTab canWrite={canWriteDefine} />
          </TabsContent>
        ) : null}
        {showSell ? (
          <TabsContent value="sell" className="mt-4">
            <SellPackTab canWrite={canWriteSell} />
          </TabsContent>
        ) : null}
        {showCredits ? (
          <TabsContent value="credits" className="mt-4">
            <PlayerCreditsTab canWrite={canWriteCredits} />
          </TabsContent>
        ) : null}
      </Tabs>
      )}
    </div>
  );
}
