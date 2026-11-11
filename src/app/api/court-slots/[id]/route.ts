// app/api/court-slots/[id]/route.ts
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server';
import { createRepositories } from '@/lib/repository-factory';
import { blocksForCourtSlot } from '@/lib/class-occupancy';
import { slotCreditHttpError } from '@/lib/slot-credit-rpc';

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  try {
    const repos = await createRepositories();
    const id = Number(params.id);

    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const slot = await repos.courtSlots.findById(id);
    if (!slot) {
      return NextResponse.json({ error: 'Court slot not found' }, { status: 404 });
    }

    return NextResponse.json(slot);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GET /court-slots/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const repos = await createRepositories();
    const slotId = Number(params.id);
    
    if (Number.isNaN(slotId)) {
      return NextResponse.json({ error: "Invalid slot id" }, { status: 400 });
    }

    const body = await request.json();

    const allowedFields = [
      "was_played",
      "notes",
      "player1_payment_method_id",
      "player1_note",
      "player2_payment_method_id",
      "player2_note",
      "player3_payment_method_id",
      "player3_note",
      "player4_payment_method_id",
      "player4_note",
      "player1_id",
      "player2_id",
      "player3_id",
      "player4_id",
    ] as const;

    const updatePayload: Record<string, any> = {};

    for (const key of allowedFields) {
      if (key in body) {
        updatePayload[key] = body[key];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const current = await repos.courtSlots.findById(slotId);
    if (!current) {
      return NextResponse.json({ error: "Court slot not found" }, { status: 404 });
    }

    const paymentKeys = [
      "player1_payment_method_id",
      "player2_payment_method_id",
      "player3_payment_method_id",
      "player4_payment_method_id",
    ];
    const chargesTurno =
      updatePayload.was_played === true ||
      paymentKeys.some((key) => key in updatePayload && updatePayload[key] != null);
    const [classOccupancy, tournamentOccupancy] = await Promise.all([
      repos.classes.listOccupancy(current.slot_date),
      repos.tournamentMatches.listCourtOccupancy(current.slot_date),
    ]);
    const holds = blocksForCourtSlot(current, classOccupancy, tournamentOccupancy);
    if (chargesTurno && (holds.class_block || holds.tournament_block)) {
      const reason = [
        holds.class_block ? `una clase (${holds.class_block.label})` : null,
        holds.tournament_block ? `un torneo (${holds.tournament_block.label})` : null,
      ]
        .filter(Boolean)
        .join(" y ");
      return NextResponse.json(
        { error: `Esa cancha está ocupada por ${reason}` },
        { status: 409 }
      );
    }

    const slot = await repos.courtSlots.update(slotId, updatePayload);
    return NextResponse.json({
      ...slot,
      ...blocksForCourtSlot(slot, classOccupancy, tournamentOccupancy),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error("PATCH /court-slots/[id] error:", error);
    return slotCreditHttpError(error, "Internal server error");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const repos = await createRepositories();
    const id = Number(params.id);

    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    await repos.courtSlots.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('DELETE /court-slots/[id] error:', error);
    return slotCreditHttpError(error, 'Internal server error');
  }
}
