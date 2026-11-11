import { BaseRepository } from "./base-repository";
import { throwSlotRpcError } from "@/lib/slot-credit-rpc";

export type SlotPackRow = {
  id: number;
  player_id: number;
  name: string;
  credits: number;
  remaining: number;
  amount_paid: number;
  payment_method_id: number | null;
  payment_method_name: string | null;
  sold_at: string;
  notes: string | null;
  created_at: string;
};

export type SlotCreditPlayerRow = {
  player_id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  balance: number;
  packs: SlotPackRow[];
};

export type SlotCreditMovementRow = {
  id: number;
  player_id: number;
  pack_id: number | null;
  pack_name: string | null;
  court_slot_id: number | null;
  seat: number | null;
  kind: "grant" | "consume" | "refund" | "adjustment";
  delta: number;
  status: string;
  slot_label: string | null;
  reason: string | null;
  created_at: string;
};

export type SlotPackDefinition = {
  id: number;
  name: string;
  credits: number;
  price: number;
  is_active: boolean;
};

type PlayerName = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export class SlotCreditsRepository extends BaseRepository {
  async listPlayers(): Promise<SlotCreditPlayerRow[]> {
    const [{ data: packs, error: packsError }, { data: balances, error: balancesError }] =
      await Promise.all([
        this.supabase.from("slot_pack_balances").select("*").order("sold_at", { ascending: false }),
        this.supabase.from("player_slot_balances").select("player_id, balance"),
      ]);

    if (packsError) throw new Error(packsError.message);
    if (balancesError) throw new Error(balancesError.message);

    const packRows = packs ?? [];
    const balanceRows = balances ?? [];
    const playerIds = Array.from(
      new Set([
        ...packRows.map((row) => Number(row.player_id)),
        ...balanceRows.map((row) => Number(row.player_id)),
      ])
    );
    if (playerIds.length === 0) return [];

    const methodIds = Array.from(
      new Set(
        packRows
          .map((row) => (row.payment_method_id == null ? null : Number(row.payment_method_id)))
          .filter((id): id is number => id != null)
      )
    );

    const [{ data: players, error: playersError }, methodsResult] = await Promise.all([
      this.supabase
        .from("players")
        .select("id, first_name, last_name, phone")
        .in("id", playerIds),
      methodIds.length
        ? this.supabase.from("payment_methods").select("id, name").in("id", methodIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (playersError) throw new Error(playersError.message);
    if (methodsResult.error) throw new Error(methodsResult.error.message);

    const playerById = new Map((players ?? []).map((player) => [Number(player.id), player as PlayerName]));
    const methodById = new Map(
      (methodsResult.data ?? []).map((method) => [Number(method.id), String(method.name)])
    );
    const balanceById = new Map(
      balanceRows.map((row) => [Number(row.player_id), Number(row.balance)])
    );

    const grouped = new Map<number, SlotCreditPlayerRow>();
    for (const playerId of playerIds) {
      const player = playerById.get(playerId);
      if (!player) continue;
      const balance = balanceById.get(playerId) ?? 0;
      grouped.set(playerId, {
        player_id: playerId,
        first_name: player.first_name,
        last_name: player.last_name,
        phone: player.phone,
        balance,
        packs: [],
      });
    }

    for (const row of packRows) {
      const playerId = Number(row.player_id);
      const entry = grouped.get(playerId);
      if (!entry) continue;
      const methodId = row.payment_method_id == null ? null : Number(row.payment_method_id);
      entry.packs.push({
        id: Number(row.id),
        player_id: playerId,
        name: String(row.name),
        credits: Number(row.credits),
        remaining: Number(row.remaining),
        amount_paid: Number(row.amount_paid),
        payment_method_id: methodId,
        payment_method_name: methodId == null ? null : methodById.get(methodId) ?? null,
        sold_at: String(row.sold_at),
        notes: row.notes == null ? null : String(row.notes),
        created_at: String(row.created_at),
      });
    }

    return Array.from(grouped.values())
      .filter((player) => player.packs.length > 0 || player.balance !== 0)
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "es")
      );
  }

  async balances(playerIds: number[]): Promise<{ player_id: number; balance: number }[]> {
    if (playerIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("player_slot_balances")
      .select("player_id, balance")
      .in("player_id", playerIds);
    if (error) throw new Error(error.message);
    const found = new Map((data ?? []).map((row) => [Number(row.player_id), Number(row.balance)]));
    return playerIds.map((playerId) => ({
      player_id: playerId,
      balance: found.get(playerId) ?? 0,
    }));
  }

  async movements(playerId: number): Promise<SlotCreditMovementRow[]> {
    const { data, error } = await this.supabase
      .from("slot_credit_movements")
      .select(
        `
        id,
        player_id,
        pack_id,
        court_slot_id,
        seat,
        kind,
        delta,
        status,
        slot_label,
        reason,
        created_at,
        pack:pack_id ( name )
      `
      )
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const pack = one(row.pack as { name: string } | { name: string }[] | null);
      return {
        id: Number(row.id),
        player_id: Number(row.player_id),
        pack_id: row.pack_id == null ? null : Number(row.pack_id),
        pack_name: pack?.name ?? null,
        court_slot_id: row.court_slot_id == null ? null : Number(row.court_slot_id),
        seat: row.seat == null ? null : Number(row.seat),
        kind: row.kind as SlotCreditMovementRow["kind"],
        delta: Number(row.delta),
        status: String(row.status),
        slot_label: row.slot_label == null ? null : String(row.slot_label),
        reason: row.reason == null ? null : String(row.reason),
        created_at: String(row.created_at),
      };
    });
  }

  async listDefinitions(): Promise<SlotPackDefinition[]> {
    const { data, error } = await this.supabase
      .from("slot_pack_definitions")
      .select("id, name, credits, price, is_active")
      .order("credits", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      credits: Number(row.credits),
      price: Number(row.price),
      is_active: Boolean(row.is_active),
    }));
  }

  async saveDefinition(input: {
    id: number | null;
    name: string;
    credits: number;
    price: number;
    isActive: boolean;
  }): Promise<number> {
    const { data, error } = await this.supabase.rpc("save_slot_pack_definition", {
      p_id: input.id,
      p_name: input.name,
      p_credits: input.credits,
      p_price: input.price,
      p_is_active: input.isActive,
    });
    throwSlotRpcError(error);
    return Number(data);
  }

  async grant(input: {
    playerId: number;
    definitionId: number;
    amountPaid: number;
    paymentMethodId: number;
    soldAt: string;
    notes: string | null;
  }): Promise<number> {
    const { data, error } = await this.supabase.rpc("grant_slot_pack", {
      p_player_id: input.playerId,
      p_definition_id: input.definitionId,
      p_amount_paid: input.amountPaid,
      p_payment_method_id: input.paymentMethodId,
      p_sold_at: input.soldAt,
      p_notes: input.notes,
    });
    throwSlotRpcError(error);
    return Number(data);
  }

  async adjust(playerId: number, delta: number, reason: string): Promise<void> {
    const { error } = await this.supabase.rpc("adjust_slot_credits", {
      p_player_id: playerId,
      p_delta: delta,
      p_reason: reason,
    });
    throwSlotRpcError(error);
  }
}
