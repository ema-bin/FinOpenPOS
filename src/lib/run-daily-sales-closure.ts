import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDailySalesSnapshot } from "@/lib/compute-daily-sales-snapshot";
import { DailySalesClosuresRepository } from "@/repositories/daily-sales-closures.repository";
import type { DailySalesClosureDTO } from "@/models/dto/daily-sales-closure";

const DEFAULT_CRON_NOTES = "Cierre automático";

export async function runDailySalesClosure(
  supabase: SupabaseClient,
  input: {
    businessDate: string;
    actorUserUid: string;
    notes?: string | null;
  }
): Promise<{ closure: DailySalesClosureDTO; replaced: boolean }> {
  const snapshot = await computeDailySalesSnapshot(supabase, input.businessDate);
  const repo = new DailySalesClosuresRepository(supabase);
  const notes = input.notes?.trim() || DEFAULT_CRON_NOTES;
  return repo.save(input.actorUserUid, snapshot, notes);
}

export function getDailySalesClosureCronActorUid(): string {
  return (
    process.env.DAILY_SALES_CLOSURE_CRON_USER_UID?.trim() ||
    "00000000-0000-0000-0000-000000000000"
  );
}

export function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}
