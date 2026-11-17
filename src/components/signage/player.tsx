"use client";

import { useEffect, useState } from "react";
import type { PlaybackSlide } from "@/components/signage/types";

function money(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export function SignagePlayer({
  items,
  transition,
  fallback,
  mode,
}: {
  items: PlaybackSlide[];
  transition: "fade" | "cut";
  fallback: { name: string; logoUrl: string | null };
  mode: "tv" | "preview";
}) {
  const [index, setIndex] = useState(0);
  const current = items[index] ?? items[0] ?? null;

  useEffect(() => {
    if (!current || !items.some((item) => item.id === current.id)) setIndex(0);
  }, [items, current]);

  useEffect(() => {
    if (!current || items.length === 0) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % items.length), current.durationSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [current, items.length]);

  useEffect(() => {
    const next = items[(index + 1) % items.length];
    if (!next?.imageUrl) return;
    const image = new window.Image();
    image.src = next.imageUrl;
  }, [index, items]);

  const frame = mode === "tv" ? "h-screen w-screen" : "aspect-video w-full";

  return (
    <div className={`${frame} overflow-hidden bg-black text-white`}>
      <style>{`@keyframes signage-fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {!current ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          {fallback.logoUrl ? <img src={fallback.logoUrl} alt="" className="max-h-[40%] max-w-[60%] object-contain" /> : null}
          <p className="text-center text-3xl font-semibold">{fallback.name}</p>
        </div>
      ) : (
        <div key={`${current.id}-${current.imageUrl}`} className="flex h-full" style={transition === "fade" ? { animation: "signage-fade 700ms ease" } : undefined}>
          {current.contentType === "promo_card" ? (
            <>
              <div className="flex w-[62%] items-center justify-center bg-black">
                <img src={current.imageUrl} alt="" className="h-full w-full object-contain" />
              </div>
              <div className="flex w-[38%] flex-col justify-center gap-3 bg-zinc-950 p-6">
                {current.highlight ? <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">{current.highlight}</p> : null}
                <p className="text-3xl font-semibold leading-tight">{current.title}</p>
                {current.description ? <p className="text-lg text-zinc-300">{current.description}</p> : null}
                {current.price != null ? <p className="text-4xl font-semibold">{money(current.price)}</p> : null}
              </div>
            </>
          ) : (
            <div className="relative h-full w-full">
              <img src={current.imageUrl} alt="" className="h-full w-full object-contain" />
              {current.title ? (
                <p className="absolute inset-x-0 bottom-0 bg-black/60 px-6 py-3 text-2xl">{current.title}</p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
