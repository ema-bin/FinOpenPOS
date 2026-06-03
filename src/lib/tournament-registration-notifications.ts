export function buildDefaultRegistrationInviteMessage(input: {
  tournamentName: string;
  categoryName: string | null;
  registrationFee?: number;
}): string {
  const categoryPart = input.categoryName ? ` (${input.categoryName})` : "";
  const fee =
    input.registrationFee != null && input.registrationFee > 0
      ? ` Cuota de inscripción: $${input.registrationFee}.`
      : "";
  return (
    `Hola {nombre}! Te escribimos desde PCP. Todavía no estás inscripto/a en el torneo "${input.tournamentName}"${categoryPart}.${fee} ` +
    `¿Te sumás? Cualquier duda respondemos por acá. ¡Saludos!`
  );
}

/** Aplica placeholders del mensaje (nombre). Quita restos de {flier} si quedaron en plantillas viejas. */
export function applyRegistrationMessagePlaceholders(
  template: string,
  player: { first_name: string; last_name: string }
): string {
  const fullName = `${player.first_name} ${player.last_name}`.trim();
  return template
    .replace(/\{nombre\}/gi, player.first_name)
    .replace(/\{nombre_completo\}/gi, fullName)
    .replace(/\n?\s*Flier del torneo:\s*\{flier(_url)?\}/gi, "")
    .replace(/\{flier(_url)?\}/gi, "")
    .replace(/\n?\s*Flier del torneo:\s*https?:\/\/\S+/gi, "")
    .trim();
}
