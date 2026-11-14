import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex, isHslTriplet } from "@/lib/clubs/color";
import { parseClubSettings } from "@/lib/clubs/settings";

const valid = {
  name: "PCP",
  short_name: "PCP",
  logo_url: null,
  primary_color: "142 60% 35%",
  accent_color: "20 80% 50%",
  on_primary_color: "0 0% 100%",
  timezone: "America/Argentina/Buenos_Aires",
  open_time: "10:00",
  close_time: "01:00",
  slot_duration_minutes: 90,
  overnight_slot: true,
  fixed_weekdays: [1, 2, 3, 4, 5],
  class_player_limit: 5,
  registration_discount_percent: 20,
  module_reservations: true,
  module_classes: true,
  module_tournaments: true,
  module_packs: true,
  module_buffet: true,
  auto_daily_closure: true,
  daily_closure_hour: 3,
  auto_reservation_week: true,
  reservation_week_weekday: 6,
  reservation_week_hour: 3,
};

describe("colores del complejo", () => {
  it("acepta la tripleta que usa Tailwind", () => {
    expect(isHslTriplet("142 60% 35%")).toBe(true);
    expect(isHslTriplet("#248f4e")).toBe(false);
  });

  it("el verde por defecto vuelve a un hex y a una tripleta", () => {
    const hex = hslToHex("142 60% 35%");
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexToHsl(hex!)).toBe("142 60% 35%");
  });
});

describe("ficha del complejo", () => {
  it("acepta la ficha de este club", () => {
    const parsed = parseClubSettings(valid);
    expect(parsed.ok).toBe(true);
  });

  it("exige al menos un día de turno fijo", () => {
    const parsed = parseClubSettings({ ...valid, fixed_weekdays: [] });
    expect(parsed.ok).toBe(false);
  });

  it("rechaza una zona horaria inventada", () => {
    const parsed = parseClubSettings({ ...valid, timezone: "Marte/Olympus" });
    expect(parsed.ok).toBe(false);
  });
});
