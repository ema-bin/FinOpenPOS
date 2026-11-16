export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { courtSlotConfig, loadActorClubSchedule } from "@/lib/clubs/load-club";
import { todayInTimeZone } from "@/lib/clubs/schedule";

type GenerateBody = {
  date?: string; // YYYY-MM-DD
};

export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const body = (await request.json()) as GenerateBody;
    
    const club = await loadActorClubSchedule();
    const slotDate = body.date || todayInTimeZone(new Date(), club.timezone);

    const courts = await repos.courts.findAll(true);
    if (courts.length === 0) {
      return NextResponse.json(
        { error: "No active courts found" },
        { status: 400 }
      );
    }

    const slots = await repos.courtSlots.generateSlotsForDate(
      slotDate,
      courtSlotConfig(club),
      courts.map((c) => c.id)
    );

    if (isCourtReservationsEnabledServer() && club.moduleReservations) {
      try {
        await repos.courtReservations.applyDate(slotDate);
      } catch (applyError) {
        console.error("No se pudieron aplicar los turnos fijos:", applyError);
      }
    }

    return NextResponse.json(slots);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error("POST /court-slots/generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
