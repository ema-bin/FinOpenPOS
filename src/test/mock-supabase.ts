import { vi } from "vitest";

/** Cadena mínima de Supabase para tests de repositorios. */
export function createMockSupabaseChain(finalResult: {
  data: unknown;
  error: unknown;
}) {
  const single = vi.fn().mockResolvedValue(finalResult);
  const order = vi.fn().mockReturnValue({ single });
  const ilike = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ order, eq, ilike, single });
  const select = vi.fn().mockReturnValue({ eq, ilike, order, single });
  const from = vi.fn().mockReturnValue({ select, insert: vi.fn(), update: vi.fn() });

  return { from, select, eq, order, single, ilike };
}
