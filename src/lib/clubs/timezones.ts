export type TimezoneChoice = { value: string; label: string };

const ARGENTINA_PREFIX = "America/Argentina/";
/** Nombres canónicos que no llevan el prefijo Argentina/. */
const ARGENTINA = new Set([
  "America/Buenos_Aires",
  "America/Catamarca",
  "America/Cordoba",
  "America/Jujuy",
  "America/Mendoza",
]);

function isArgentina(zone: string): boolean {
  return zone.startsWith(ARGENTINA_PREFIX) || ARGENTINA.has(zone);
}

/** America/Argentina/Buenos_Aires y America/Buenos_Aires son la misma zona. */
export function canonicalTimezone(timeZone: string): string {
  try {
    return Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone || timeZone;
  } catch {
    return timeZone;
  }
}

function knownZones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
  return ["America/Argentina/Buenos_Aires"];
}

export function timezoneLabel(timeZone: string, now = new Date()): string {
  const parts = timeZone.split("/");
  const place = (parts[parts.length - 1] ?? timeZone).replace(/_/g, " ");
  try {
    const offset = new Intl.DateTimeFormat("es", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${place} (${offset})` : place;
  } catch {
    return place;
  }
}

/** Argentina primero. El resto, por el nombre del lugar. */
export function timezoneChoices(now = new Date()): TimezoneChoice[] {
  return knownZones()
    .map((value) => ({ value, label: timezoneLabel(value, now) }))
    .sort((a, b) => {
      const aHome = isArgentina(a.value) ? 0 : 1;
      const bHome = isArgentina(b.value) ? 0 : 1;
      if (aHome !== bHome) return aHome - bHome;
      return a.label.localeCompare(b.label, "es");
    });
}
