import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadActorClubSchedule, type ClubSchedule } from "@/lib/clubs/load-club";

export type ClubModule = "reservations" | "classes" | "tournaments" | "packs" | "buffet";

const RULES: ReadonlyArray<{ prefix: string; module: ClubModule }> = [
  { prefix: "/admin/reservations", module: "reservations" },
  { prefix: "/api/court-reservations", module: "reservations" },
  { prefix: "/api/court-fixed-bookings", module: "reservations" },
  { prefix: "/admin/classes", module: "classes" },
  { prefix: "/api/classes", module: "classes" },
  { prefix: "/admin/tournaments", module: "tournaments" },
  { prefix: "/api/tournaments", module: "tournaments" },
  { prefix: "/api/tournament-matches", module: "tournaments" },
  { prefix: "/api/admin/dashboard/tournaments", module: "tournaments" },
  { prefix: "/admin/slot-packs", module: "packs" },
  { prefix: "/api/slot-packs", module: "packs" },
  { prefix: "/api/slot-pack-definitions", module: "packs" },
  { prefix: "/api/slot-credits", module: "packs" },
  { prefix: "/admin/orders", module: "buffet" },
  { prefix: "/admin/quick-sale", module: "buffet" },
  { prefix: "/admin/purchases-history", module: "buffet" },
  { prefix: "/admin/purchases", module: "buffet" },
  { prefix: "/admin/suppliers", module: "buffet" },
  { prefix: "/admin/products", module: "buffet" },
  { prefix: "/admin/product-categories", module: "buffet" },
  { prefix: "/admin/daily-sales-closure", module: "buffet" },
  { prefix: "/admin/monthly-sales-closure", module: "buffet" },
  { prefix: "/api/orders", module: "buffet" },
  { prefix: "/api/purchases", module: "buffet" },
  { prefix: "/api/suppliers", module: "buffet" },
  { prefix: "/api/products", module: "buffet" },
  { prefix: "/api/product-categories", module: "buffet" },
  { prefix: "/api/stock-movements", module: "buffet" },
  { prefix: "/api/daily-sales-closures", module: "buffet" },
  { prefix: "/api/monthly-sales-closures", module: "buffet" },
  { prefix: "/api/admin/dashboard/sales", module: "buffet" },
];

const FLAG: Record<ClubModule, keyof ClubSchedule> = {
  reservations: "moduleReservations",
  classes: "moduleClasses",
  tournaments: "moduleTournaments",
  packs: "modulePacks",
  buffet: "moduleBuffet",
};

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** El módulo que gobierna esa ruta, o null si la ruta no depende de un interruptor. */
export function moduleForPath(pathname: string): ClubModule | null {
  const rule = RULES.filter((item) => matches(pathname, item.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length
  )[0];
  return rule?.module ?? null;
}

export async function isClubModuleOpen(clubModule: ClubModule): Promise<boolean> {
  const club = await loadActorClubSchedule();
  return Boolean(club[FLAG[clubModule]]);
}

/** Si el interruptor de esta petición está apagado, responde 404. */
export async function assertRequestModule(): Promise<void> {
  let path = "";
  try {
    path = headers().get("x-pcp-path") ?? "";
  } catch {
    return;
  }
  const clubModule = moduleForPath(path);
  if (!clubModule) return;
  if (!(await isClubModuleOpen(clubModule))) notFound();
}
