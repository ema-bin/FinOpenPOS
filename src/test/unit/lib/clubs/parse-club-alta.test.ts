import { describe, expect, it } from "vitest";
import { parseClubAlta } from "@/lib/clubs/parse-club-alta";

const settings = {
  name: "Norte",
  short_name: "Norte",
  logo_url: "https://ejemplo.test/logo.png",
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

const admin = { name: "Ana", email: "ana@norte.test", password: "secreto" };

describe("alta de un complejo", () => {
  it("acepta la ficha, las canchas y el mismo medio en dos listas", () => {
    const parsed = parseClubAlta({
      settings,
      courts: ["Central"],
      payments: { courts: ["Efectivo"], buffet: ["Efectivo"], classes: [], tournaments: [] },
      admin,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.settings.logo_url).toBeNull();
    expect(parsed.value.payments.courts).toEqual(["Efectivo"]);
    expect(parsed.value.payments.buffet).toEqual(["Efectivo"]);
    expect(parsed.value.admin.email).toBe("ana@norte.test");
  });

  it("pide al menos una cancha y un email nuevo válido", () => {
    expect(parseClubAlta({ settings, courts: [], payments: {}, admin }).ok).toBe(false);
    expect(
      parseClubAlta({ settings, courts: ["Central"], payments: {}, admin: { ...admin, email: "ana" } }).ok
    ).toBe(false);
  });
});
