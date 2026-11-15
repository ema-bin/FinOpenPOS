import type { SupabaseClient } from "@supabase/supabase-js";
import { CLUB_SCOPED_TABLES } from "@/lib/clubs/club-tables";

export function stampClubId<T>(values: T, clubId: number): T {
  if (Array.isArray(values)) {
    return values.map((row) => stampClubId(row, clubId)) as T;
  }
  if (values && typeof values === "object") {
    return { ...(values as Record<string, unknown>), club_id: clubId } as T;
  }
  return values;
}

/**
 * Las lecturas de una tabla del club exigen ese club_id.
 * Los insert pisan cualquier club_id que haya mandado el cliente.
 */
export function scopeClubClient(supabase: SupabaseClient, clubId: number): SupabaseClient {
  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = target.from(table);
        if (!CLUB_SCOPED_TABLES.has(table)) return builder;
        return new Proxy(builder, {
          get(query, method, queryReceiver) {
            const value = Reflect.get(query, method, queryReceiver);
            if (typeof value !== "function") return value;
            if (method === "insert" || method === "upsert") {
              return (values: unknown, options?: unknown) => value.call(query, stampClubId(values, clubId), options);
            }
            if (method === "select" || method === "update" || method === "delete") {
              return (...args: unknown[]) => value.apply(query, args).eq("club_id", clubId);
            }
            return value.bind(query);
          },
        });
      };
    },
  }) as SupabaseClient;
}
