export function buildDefaultRegistrationInviteMessage(input: {
  tournamentName: string;
  categoryName: string | null;
  registrationFee?: number;
  includeFlyerLink?: boolean;
}): string {
  const categoryPart = input.categoryName ? ` (${input.categoryName})` : "";
  const fee =
    input.registrationFee != null && input.registrationFee > 0
      ? ` Cuota de inscripción: $${input.registrationFee}.`
      : "";
  let message =
    `Hola {nombre}! Te escribimos desde PCP. Todavía no estás inscripto/a en el torneo "${input.tournamentName}"${categoryPart}.${fee} ` +
    `¿Te sumás? Cualquier duda respondemos por acá. ¡Saludos!`;
  if (input.includeFlyerLink) {
    message += `\n\nFlier del torneo: {flier}`;
  }
  return message;
}

/** Aplica placeholders del mensaje (nombre, link al flier). */
export function applyRegistrationMessagePlaceholders(
  template: string,
  player: { first_name: string; last_name: string },
  options?: { flyerUrl?: string | null; includeFlyer?: boolean }
): string {
  const fullName = `${player.first_name} ${player.last_name}`.trim();
  let msg = template
    .replace(/\{nombre\}/gi, player.first_name)
    .replace(/\{nombre_completo\}/gi, fullName);

  const includeFlyer = options?.includeFlyer !== false;
  const flyerUrl = options?.flyerUrl?.trim();
  if (includeFlyer && flyerUrl) {
    msg = msg.replace(/\{flier(_url)?\}/gi, flyerUrl);
  } else {
    msg = msg
      .replace(/\n?\s*Flier del torneo:\s*\{flier(_url)?\}/gi, "")
      .replace(/\{flier(_url)?\}/gi, "")
      .replace(/\n?\s*Flier del torneo:\s*https?:\/\/\S+/gi, "")
      .trim();
  }
  return msg;
}
