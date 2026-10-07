import { vi } from "vitest";

export type MockSupabaseResult = { data: unknown; error: unknown };

/**
 * Builder encadenable que resuelve como Promise (await) y soporta .in / .eq / .single.
 */
export function createMockQueryBuilder(result: MockSupabaseResult) {
  const promise = Promise.resolve(result);

  const builder: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: Promise<MockSupabaseResult>["then"];
    catch: Promise<MockSupabaseResult>["catch"];
    finally: Promise<MockSupabaseResult>["finally"];
  } = {} as never;

  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(() => builder);
  builder.in = vi.fn(() => promise);
  builder.limit = vi.fn(() => promise);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = promise.then.bind(promise);
  builder.catch = promise.catch.bind(promise);
  builder.finally = promise.finally.bind(promise);

  return builder;
}

/** Igual que createMockQueryBuilder pero `.in()` sigue encadenando (p. ej. `.in().order()`). */
export function createMockQueryBuilderChainable(result: MockSupabaseResult) {
  const builder = createMockQueryBuilder(result);
  builder.in = vi.fn(() => builder);
  return builder;
}

export function createMockSupabaseClient(
  tableHandlers: Record<string, () => ReturnType<typeof createMockQueryBuilder>>
) {
  return {
    from: vi.fn((table: string) => {
      const handler = tableHandlers[table];
      if (!handler) {
        throw new Error(`Mock Supabase: tabla no configurada: ${table}`);
      }
      return handler();
    }),
  };
}
