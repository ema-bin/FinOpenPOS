"use client";

import { useEffect, useState } from "react";
import { SignagePlayer } from "@/components/signage/player";
import type { PlaybackSlide } from "@/components/signage/types";

type Payload = {
  revision: string;
  unchanged?: boolean;
  screenName?: string;
  transition?: "fade" | "cut";
  items?: PlaybackSlide[];
  fallback?: { name: string; logoUrl: string | null };
};

export function TvScreen({ token }: { token: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let revision = "";
    let stopped = false;

    async function load() {
      try {
        const query = revision ? `?revision=${encodeURIComponent(revision)}` : "";
        const response = await fetch(`/api/signage/play/${encodeURIComponent(token)}${query}`, { cache: "no-store" });
        if (response.status === 404) {
          if (!stopped) setMissing(true);
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as Payload;
        revision = body.revision;
        if (!stopped && !body.unchanged) setPayload(body);
        if (!stopped) setMissing(false);
      } catch {
        // Se queda con la última lista y vuelve a intentar.
      }
    }

    void load();
    const timer = window.setInterval(load, 45_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (missing && !payload) {
    return <div className="flex h-screen items-center justify-center bg-black text-white">Esta pantalla no está disponible</div>;
  }

  return (
    <SignagePlayer
      mode="tv"
      items={payload?.items ?? []}
      transition={payload?.transition === "cut" ? "cut" : "fade"}
      fallback={payload?.fallback ?? { name: payload?.screenName ?? "", logoUrl: null }}
    />
  );
}
