import { describe, expect, it } from "vitest";
import { creditSaveError, methodConsumesCredit, type CreditMethodRef, type CreditSeat } from "@/lib/slot-credits";

const qr: CreditMethodRef = { id: 1, name: "QR" };
const cash: CreditMethodRef = { id: 2, name: "Efectivo" };
const marked: CreditMethodRef = { id: 3, name: "Prepago", consumes_slot_credit: true };
const methods = [qr, cash, marked];

function seat(paymentMethodId: number | null, playerId: number | null): CreditSeat {
  return { paymentMethodId, playerId };
}

describe("methodConsumesCredit", () => {
  it("reconoce el QR por el nombre y por la marca", () => {
    expect(methodConsumesCredit(qr)).toBe(true);
    expect(methodConsumesCredit(marked)).toBe(true);
    expect(methodConsumesCredit(cash)).toBe(false);
    expect(methodConsumesCredit(null)).toBe(false);
  });
});

describe("creditSaveError", () => {
  const base = {
    methods,
    playerNames: new Map([[7, "Ana Pérez"], [8, "Luis Díaz"]]),
  };

  it("deja pasar efectivo sin jugador", () => {
    expect(
      creditSaveError({
        ...base,
        wasPlayed: true,
        seats: [seat(2, null), seat(null, null), seat(null, null), seat(null, null)],
        savedWasPlayed: false,
        savedSeats: [seat(null, null), seat(null, null), seat(null, null), seat(null, null)],
        balances: new Map(),
      })
    ).toBeNull();
  });

  it("pide jugador cuando el puesto descuenta crédito", () => {
    expect(
      creditSaveError({
        ...base,
        wasPlayed: true,
        seats: [seat(1, null), seat(null, null), seat(null, null), seat(null, null)],
        savedWasPlayed: false,
        savedSeats: [seat(null, null), seat(null, null), seat(null, null), seat(null, null)],
        balances: new Map([[7, 10]]),
      })
    ).toBe("Elegí un jugador con créditos");
  });

  it("exige un crédito nuevo por cada puesto del mismo jugador", () => {
    expect(
      creditSaveError({
        ...base,
        wasPlayed: true,
        seats: [seat(1, 7), seat(1, 7), seat(null, null), seat(null, null)],
        savedWasPlayed: false,
        savedSeats: [seat(null, null), seat(null, null), seat(null, null), seat(null, null)],
        balances: new Map([[7, 1]]),
      })
    ).toBe("Ana Pérez no tiene créditos suficientes");
  });

  it("no vuelve a descontar un puesto que ya estaba guardado", () => {
    const seats = [seat(1, 7), seat(2, null), seat(null, null), seat(null, null)];
    expect(
      creditSaveError({
        ...base,
        wasPlayed: true,
        seats,
        savedWasPlayed: true,
        savedSeats: seats,
        balances: new Map([[7, 0]]),
      })
    ).toBeNull();
  });

  it("al cambiar de jugador le pide crédito al nuevo", () => {
    expect(
      creditSaveError({
        ...base,
        wasPlayed: true,
        seats: [seat(3, 8), seat(null, null), seat(null, null), seat(null, null)],
        savedWasPlayed: true,
        savedSeats: [seat(3, 7), seat(null, null), seat(null, null), seat(null, null)],
        balances: new Map([[7, 0], [8, 0]]),
      })
    ).toBe("Luis Díaz no tiene créditos suficientes");
  });

  it("un turno no jugado no pide créditos", () => {
    expect(
      creditSaveError({
        ...base,
        wasPlayed: false,
        seats: [seat(1, null), seat(null, null), seat(null, null), seat(null, null)],
        savedWasPlayed: true,
        savedSeats: [seat(1, 7), seat(null, null), seat(null, null), seat(null, null)],
        balances: new Map([[7, 0]]),
      })
    ).toBeNull();
  });
});
