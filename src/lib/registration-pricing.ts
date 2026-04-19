import type { SupabaseClient } from "@supabase/supabase-js";

export type RegistrationPricingSettings = {
  puntuable_lower_category_discount_percent: number;
};

const DEFAULT_SETTINGS: RegistrationPricingSettings = {
  puntuable_lower_category_discount_percent: 20,
};

export async function fetchRegistrationPricingSettings(
  supabase: SupabaseClient
): Promise<RegistrationPricingSettings> {
  const { data, error } = await supabase
    .from("registration_pricing_settings")
    .select("puntuable_lower_category_discount_percent")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_SETTINGS;
  }

  return {
    puntuable_lower_category_discount_percent: Number(
      (data as { puntuable_lower_category_discount_percent: number | string })
        .puntuable_lower_category_discount_percent ??
        DEFAULT_SETTINGS.puntuable_lower_category_discount_percent
    ),
  };
}

export type PlayerPricingInput = {
  registrationFee: number;
  tournament: {
    is_puntuable: boolean;
    is_category_specific: boolean;
    is_suma_13_damas: boolean;
    category_id: number | null;
  };
  player: {
    category_id: number | null;
    female_category_id: number | null;
  };
  settings: RegistrationPricingSettings;
  /** Marcado manual en pagos del torneo */
  isRegistrationFree: boolean;
  categoryOrders: Map<number, number>;
  tournamentCategoryType: "libre" | "damas" | null;
};

export type PlayerPricingResult = {
  amount_due: number;
  pricing_reason: string | null;
};

/**
 * Mayor display_order = mejor categoría (3ra > 7ma).
 * Descuento: jugador con categoría peor (menor display_order) que el torneo en puntuables.
 */
export function computePlayerRegistrationAmount(input: PlayerPricingInput): PlayerPricingResult {
  const fee = Math.max(0, Number(input.registrationFee) || 0);
  const { tournament, player, settings, categoryOrders } = input;

  if (input.isRegistrationFree) {
    return { amount_due: 0, pricing_reason: "Inscripción gratis (manual)" };
  }

  if (fee === 0) {
    return { amount_due: 0, pricing_reason: null };
  }

  if (
    tournament.is_puntuable &&
    tournament.is_category_specific &&
    !tournament.is_suma_13_damas &&
    tournament.category_id != null
  ) {
    const tOrder = categoryOrders.get(tournament.category_id);
    const playerCatId =
      input.tournamentCategoryType === "damas" ? player.female_category_id : player.category_id;
    if (tOrder !== undefined && playerCatId != null) {
      const pOrder = categoryOrders.get(playerCatId);
      if (pOrder !== undefined && pOrder < tOrder) {
        const pct = Math.min(100, Math.max(0, settings.puntuable_lower_category_discount_percent));
        const discounted = fee * (1 - pct / 100);
        const rounded = Math.round(discounted * 100) / 100;
        return {
          amount_due: rounded,
          pricing_reason: `Descuento ${pct}% (categoría inferior al torneo)`,
        };
      }
    }
  }

  return { amount_due: fee, pricing_reason: null };
}

export async function batchComputePlayerRegistrationPricing(
  supabase: SupabaseClient,
  tournamentId: number,
  playerIds: number[]
): Promise<Map<number, PlayerPricingResult>> {
  const result = new Map<number, PlayerPricingResult>();
  if (playerIds.length === 0) return result;

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select(
      "registration_fee, is_puntuable, is_category_specific, is_suma_13_damas, category_id"
    )
    .eq("id", tournamentId)
    .single();

  if (tErr || !tournament) {
    return result;
  }

  const t = tournament as {
    registration_fee: number | string | null;
    is_puntuable: boolean;
    is_category_specific: boolean;
    is_suma_13_damas: boolean;
    category_id: number | null;
  };

  const fee = Math.max(0, Number(t.registration_fee) || 0);
  const settings = await fetchRegistrationPricingSettings(supabase);

  let tournamentCategoryType: "libre" | "damas" | null = null;
  if (t.category_id != null) {
    const { data: cat } = await supabase
      .from("categories")
      .select("type")
      .eq("id", t.category_id)
      .maybeSingle();
    const ty = (cat as { type: string } | null)?.type;
    if (ty === "libre" || ty === "damas") {
      tournamentCategoryType = ty;
    }
  }

  const { data: playersRows } = await supabase
    .from("players")
    .select("id, category_id, female_category_id")
    .in("id", playerIds);

  const playersById = new Map<
    number,
    { category_id: number | null; female_category_id: number | null }
  >();
  for (const row of playersRows ?? []) {
    const p = row as {
      id: number;
      category_id: number | null;
      female_category_id: number | null;
    };
    playersById.set(p.id, {
      category_id: p.category_id,
      female_category_id: p.female_category_id,
    });
  }

  const { data: freeRows } = await supabase
    .from("tournament_registration_payments")
    .select("player_id, is_registration_free")
    .eq("tournament_id", tournamentId)
    .in("player_id", playerIds);

  const freeByPlayer = new Map<number, boolean>();
  for (const row of freeRows ?? []) {
    const r = row as { player_id: number; is_registration_free: boolean | null };
    freeByPlayer.set(r.player_id, Boolean(r.is_registration_free));
  }

  const catIdSet = new Set<number>();
  if (t.category_id != null) catIdSet.add(t.category_id);
  for (const pid of playerIds) {
    const pl = playersById.get(pid);
    if (pl?.category_id != null) catIdSet.add(pl.category_id);
    if (pl?.female_category_id != null) catIdSet.add(pl.female_category_id);
  }

  const categoryOrders = new Map<number, number>();
  if (catIdSet.size > 0) {
    const { data: cats } = await supabase
      .from("categories")
      .select("id, display_order")
      .in("id", Array.from(catIdSet));
    for (const c of cats ?? []) {
      const row = c as { id: number; display_order: number };
      categoryOrders.set(row.id, row.display_order);
    }
  }

  for (const pid of playerIds) {
    const pl = playersById.get(pid);
    if (!pl) continue;
    const pricing = computePlayerRegistrationAmount({
      registrationFee: fee,
      tournament: {
        is_puntuable: t.is_puntuable,
        is_category_specific: t.is_category_specific,
        is_suma_13_damas: t.is_suma_13_damas,
        category_id: t.category_id,
      },
      player: {
        category_id: pl.category_id,
        female_category_id: pl.female_category_id,
      },
      settings,
      isRegistrationFree: freeByPlayer.get(pid) ?? false,
      categoryOrders,
      tournamentCategoryType,
    });
    result.set(pid, pricing);
  }

  return result;
}

export async function computePlayerRegistrationPricing(
  supabase: SupabaseClient,
  tournamentId: number,
  playerId: number
): Promise<PlayerPricingResult> {
  const map = await batchComputePlayerRegistrationPricing(supabase, tournamentId, [playerId]);
  return (
    map.get(playerId) ?? {
      amount_due: 0,
      pricing_reason: null,
    }
  );
}
