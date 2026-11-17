import { describe, expect, it } from "vitest";
import { promotionIsLive, resolvePlayback, schedulesConflict, type SignageSchedule } from "@/lib/signage/resolve";
import { isDigitalSignageEnabledServer } from "@/lib/signage-flag";

const ZONE = "America/Argentina/Buenos_Aires";

function schedule(partial: Partial<SignageSchedule> & Pick<SignageSchedule, "id" | "playlistId">): SignageSchedule {
  return {
    weekdays: [1, 2, 3, 4, 5],
    startTime: "12:00",
    endTime: "18:00",
    startsOn: null,
    endsOn: null,
    priority: 0,
    isActive: true,
    ...partial,
  };
}

describe("cartelería", () => {
  const active = new Set([2, 3, 9]);

  it("elige la franja del horario y salta la medianoche al día anterior", () => {
    const schedules = [
      schedule({ id: 1, playlistId: 2, startTime: "12:00", endTime: "18:00" }),
      schedule({ id: 2, playlistId: 3, startTime: "18:00", endTime: "02:00" }),
    ];
    expect(resolvePlayback({
      now: new Date("2026-11-20T18:00:00.000Z"),
      timeZone: ZONE,
      schedules,
      defaultPlaylistId: 9,
      override: null,
      activePlaylistIds: active,
    }).playlistId).toBe(2);
    expect(resolvePlayback({
      now: new Date("2026-11-21T04:00:00.000Z"),
      timeZone: ZONE,
      schedules,
      defaultPlaylistId: 9,
      override: null,
      activePlaylistIds: active,
    })).toMatchObject({ source: "schedule", playlistId: 3, scheduleId: 2 });
    expect(resolvePlayback({
      now: new Date("2026-11-22T04:00:00.000Z"),
      timeZone: ZONE,
      schedules,
      defaultPlaylistId: 9,
      override: null,
      activePlaylistIds: active,
    }).playlistId).toBe(9);
  });

  it("la prioridad más alta gana y el modo manual tapa la programación", () => {
    const schedules = [
      schedule({ id: 1, playlistId: 2, priority: 1 }),
      schedule({ id: 4, playlistId: 3, priority: 5 }),
    ];
    const now = new Date("2026-11-20T18:00:00.000Z");
    expect(resolvePlayback({
      now,
      timeZone: ZONE,
      schedules,
      defaultPlaylistId: 9,
      override: null,
      activePlaylistIds: active,
    }).playlistId).toBe(3);
    expect(resolvePlayback({
      now,
      timeZone: ZONE,
      schedules,
      defaultPlaylistId: 9,
      override: { playlistId: 9, endsAt: "2026-11-20T19:00:00.000Z" },
      activePlaylistIds: active,
    })).toMatchObject({ source: "override", playlistId: 9 });
  });

  it("un manual vencido vuelve a la lista de respaldo si no hay franja", () => {
    const choice = resolvePlayback({
      now: new Date("2026-11-21T15:00:00.000Z"),
      timeZone: ZONE,
      schedules: [schedule({ id: 1, playlistId: 2, weekdays: [1] })],
      defaultPlaylistId: 9,
      override: { playlistId: 3, endsAt: "2026-11-21T14:00:00.000Z" },
      activePlaylistIds: active,
    });
    expect(choice).toEqual({ source: "default", playlistId: 9, scheduleId: null });
  });

  it("sin contenido válido queda la pantalla institucional", () => {
    expect(resolvePlayback({
      now: new Date("2026-11-20T18:00:00.000Z"),
      timeZone: ZONE,
      schedules: [],
      defaultPlaylistId: null,
      override: null,
      activePlaylistIds: active,
    }).source).toBe("fallback");
    expect(promotionIsLive({ isActive: false, startsOn: null, endsOn: null }, "2026-11-20")).toBe(false);
    expect(promotionIsLive({ isActive: true, startsOn: "2026-11-21", endsOn: null }, "2026-11-20")).toBe(false);
  });

  it("avisa cuando dos franjas se pisan", () => {
    const lunch = schedule({ id: 1, playlistId: 2, startTime: "12:00", endTime: "18:00" });
    const overlap = schedule({ id: 2, playlistId: 3, startTime: "17:00", endTime: "20:00" });
    const night = schedule({ id: 3, playlistId: 3, startTime: "21:00", endTime: "02:00", weekdays: [5] });
    expect(schedulesConflict(lunch, overlap)).toBe(true);
    expect(schedulesConflict(lunch, night)).toBe(false);
  });

  it("el módulo nace apagado", () => {
    const server = process.env.ENABLE_DIGITAL_SIGNAGE;
    const client = process.env.NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE;
    delete process.env.ENABLE_DIGITAL_SIGNAGE;
    delete process.env.NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE;
    expect(isDigitalSignageEnabledServer()).toBe(false);
    process.env.ENABLE_DIGITAL_SIGNAGE = "true";
    expect(isDigitalSignageEnabledServer()).toBe(false);
    if (server == null) delete process.env.ENABLE_DIGITAL_SIGNAGE;
    else process.env.ENABLE_DIGITAL_SIGNAGE = server;
    if (client == null) delete process.env.NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE;
    else process.env.NEXT_PUBLIC_ENABLE_DIGITAL_SIGNAGE = client;
  });
});
