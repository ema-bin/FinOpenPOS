import { TOURNAMENT_REGISTRATION_INVITE_TEMPLATE } from "@/templates/whatsapp/tournament-registration-invite.template";

export function buildDefaultRegistrationInviteMessage(): string {
  return TOURNAMENT_REGISTRATION_INVITE_TEMPLATE;
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
