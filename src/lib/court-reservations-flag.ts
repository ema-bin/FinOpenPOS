/**
 * Reservas y turnos fijos. Apagado salvo que las dos variables estén en "true".
 * ENABLE_COURT_RESERVATIONS la lee el servidor. NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS, la pantalla.
 */
export function isCourtReservationsEnabledServer(): boolean {
  return (
    process.env.ENABLE_COURT_RESERVATIONS === "true" &&
    process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS === "true"
  );
}

export function isCourtReservationsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS === "true";
}
