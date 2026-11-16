import { notFound } from "next/navigation";
import { reservationsClosed } from "@/lib/court-reservation-http";
import { ReservationsScreen } from "@/components/reservations/ReservationsScreen";

export default async function ReservationsPage() {
  if (await reservationsClosed()) notFound();
  return <ReservationsScreen />;
}
