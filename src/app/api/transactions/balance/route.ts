export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type QueryParams = {
  params: {};
};

export async function GET(req: Request, _ctx: QueryParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    const typeFilter = url.searchParams.get("type");

    const p_from_date = fromDate
      ? new Date(`${fromDate}T00:00:00`).toISOString()
      : null;
    const p_to_date = toDate
      ? new Date(`${toDate}T23:59:59.999`).toISOString()
      : null;
    const p_type =
      typeFilter && typeFilter !== "all" ? typeFilter : null;

    const { data: rows, error: rpcError } = await supabase.rpc(
      "transaction_balance_statistics",
      { p_from_date, p_to_date, p_type }
    );

    if (rpcError) {
      console.error("transaction_balance_statistics RPC error:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Failed to fetch balance" },
        { status: 500 }
      );
    }

    const list = (rows ?? []) as Array<{
      payment_method_id: number | null;
      payment_method_name: string | null;
      incomes: string | number;
      expenses: string | number;
      withdrawals: string | number;
      adjustments: string | number;
      balance: string | number;
    }>;

    const summary: Record<string, number> = {};
    list.forEach((row) => {
      const inc = Number(row.incomes) || 0;
      const exp = Number(row.expenses) || 0;
      const with_ = Number(row.withdrawals) || 0;
      const adj = Number(row.adjustments) || 0;
      summary.income = (summary.income ?? 0) + inc;
      summary.expense = (summary.expense ?? 0) + exp;
      summary.withdrawal = (summary.withdrawal ?? 0) + with_;
      summary.adjustment = (summary.adjustment ?? 0) + adj;
    });

    const balanceByPaymentMethod = list.map((row) => ({
      payment_method_id: row.payment_method_id,
      payment_method_name: row.payment_method_name,
      incomes: Number(row.incomes) || 0,
      expenses: Number(row.expenses) || 0,
      withdrawals: Number(row.withdrawals) || 0,
      adjustments: Number(row.adjustments) || 0,
      balance: Number(row.balance) || 0,
    }));

    return NextResponse.json({
      summary,
      balanceByPaymentMethod,
    });
  } catch (error) {
    console.error("GET /transactions/balance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
