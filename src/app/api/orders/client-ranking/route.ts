// app/api/orders/client-ranking/route.ts
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface ClientRankingItem {
  playerId: number;
  playerName: string;
  totalAmount: number;
  orderCount: number;
}

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');

    const p_from_date = fromDate
      ? new Date(fromDate + 'T00:00:00').toISOString()
      : null;
    const p_to_date = toDate
      ? new Date(toDate + 'T23:59:59.999').toISOString()
      : null;

    const { data: rows, error: rpcError } = await supabase.rpc(
      'client_ranking_statistics',
      { p_from_date, p_to_date }
    );

    if (rpcError) {
      console.error('client_ranking_statistics RPC error:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to fetch client ranking' },
        { status: 500 }
      );
    }

    const ranking: ClientRankingItem[] = (rows ?? []).map((row: any) => ({
      playerId: row.player_id,
      playerName: row.player_name ?? '',
      totalAmount: Number(row.total_amount) ?? 0,
      orderCount: Number(row.order_count) ?? 0,
    }));

    return NextResponse.json(ranking);
  } catch (error) {
    console.error('GET /orders/client-ranking error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
