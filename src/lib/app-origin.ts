/** URL base de la app (para links en mensajes, fliers, etc.). */
export function getAppOrigin(request?: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (request) {
    return new URL(request.url).origin;
  }
  return "http://localhost:3000";
}

/** URL del flier si está subido; si no, null. */
export function resolveTournamentPromoFlyerUrl(tournament: {
  promo_flyer_url?: string | null;
}): string | null {
  const url = tournament.promo_flyer_url?.trim();
  return url || null;
}
