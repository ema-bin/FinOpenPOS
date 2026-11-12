export class ReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationError";
  }
}

export function throwReservationRpcError(error: { message?: string } | null): void {
  if (!error) return;
  const raw = error.message ?? "Error";
  const marker = "RESERVATION:";
  const index = raw.indexOf(marker);
  if (index >= 0) {
    const message = raw.slice(index + marker.length).split("\n")[0].trim();
    throw new ReservationError(message || "No se pudo actualizar la reserva");
  }
  if (
    raw.includes("reserve_court_slot") ||
    raw.includes("save_court_fixed_booking") ||
    raw.includes("apply_fixed_bookings") ||
    raw.includes("cancel_court_reservation") ||
    raw.includes("schema cache") ||
    raw.includes("court_fixed_bookings")
  ) {
    throw new Error("Falta aplicar el script de reservas en la base.");
  }
  throw new Error(raw);
}
