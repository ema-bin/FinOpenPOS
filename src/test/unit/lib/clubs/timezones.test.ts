import { describe, expect, it } from "vitest";
import { canonicalTimezone, timezoneChoices, timezoneLabel } from "@/lib/clubs/timezones";

describe("zonas horarias", () => {
  it("muestra Buenos Aires con su diferencia horaria", () => {
    const label = timezoneLabel("America/Argentina/Buenos_Aires", new Date("2026-06-15T15:00:00.000Z"));
    expect(label).toMatch(/^Buenos Aires \(GMT[−-]3\)$/);
  });

  it("pone las de Argentina al principio de la lista", () => {
    const choices = timezoneChoices();
    expect(choices[0]?.value).toBe("America/Buenos_Aires");
    expect(canonicalTimezone("America/Argentina/Buenos_Aires")).toBe("America/Buenos_Aires");
    const firstForeign = choices.findIndex((choice) => !choice.value.startsWith("America/Argentina/") && choice.value !== "America/Buenos_Aires" && choice.value !== "America/Cordoba" && choice.value !== "America/Mendoza" && choice.value !== "America/Catamarca" && choice.value !== "America/Jujuy");
    expect(firstForeign).toBeGreaterThan(0);
    expect(choices.slice(0, firstForeign).every((choice) => choice.label.includes("GMT"))).toBe(true);
  });
});
