import { notFound } from "next/navigation";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { ReservationsScreen } from "@/components/reservations/ReservationsScreen";

export default function ReservationsPage() {
  if (!isCourtReservationsEnabledServer()) notFound();
  return <ReservationsScreen />;
}
