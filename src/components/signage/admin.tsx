"use client";

import { useState } from "react";
import { usePermissions } from "@/components/permissions-provider";
import { PlaylistsTab } from "@/components/signage/playlists-tab";
import { PromotionsTab } from "@/components/signage/promotions-tab";
import { ScheduleTab } from "@/components/signage/schedule-tab";
import { ScreensTab } from "@/components/signage/screens-tab";

const TABS = [
  ["promotions", "Promociones"],
  ["playlists", "Listas"],
  ["screens", "Pantallas"],
] as const;

type Tab = (typeof TABS)[number][0] | "schedule";

export function SignageAdmin() {
  const [tab, setTab] = useState<Tab>("promotions");
  const { can, loading } = usePermissions();
  const canWrite = !loading && can("signage.manage");

  return (
    <div className="grid gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Cartelería</h2>
          <p className="text-sm text-muted-foreground">Promociones, listas y pantallas del complejo.</p>
        </div>
        <button
          type="button"
          className={`text-xs underline-offset-4 hover:underline ${tab === "schedule" ? "font-medium text-foreground" : "text-muted-foreground"}`}
          onClick={() => setTab(tab === "schedule" ? "promotions" : "schedule")}
        >
          Horarios
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${tab === id ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "promotions" ? <PromotionsTab canWrite={canWrite} /> : null}
      {tab === "playlists" ? <PlaylistsTab canWrite={canWrite} /> : null}
      {tab === "screens" ? <ScreensTab canWrite={canWrite} /> : null}
      {tab === "schedule" ? <ScheduleTab canWrite={canWrite} /> : null}
    </div>
  );
}
