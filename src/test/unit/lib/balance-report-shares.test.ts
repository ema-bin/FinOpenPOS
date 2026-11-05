import { describe, expect, it } from "vitest";
import { buildShareProposal, shareKeyFor } from "@/lib/balance-report-shares";

describe("propuesta de retiro", () => {
  it("resta de cada una solo lo que ella ya retiró", () => {
    const proposal = buildShareProposal({
      sales: 10000,
      purchases: 0,
      adjustmentsTotal: 0,
      withdrawals: [
        { amount: 2000, partner: { first_name: "Marina", last_name: "Leffler" } },
        { amount: 1000, partner: { first_name: "Cintia", last_name: "Leffler" } },
      ],
    });

    expect(proposal.parts[0]).toMatchObject({
      label: "Marina Leffler",
      half: 5000,
      already: 2000,
      proposed: 3000,
    });
    expect(proposal.parts[1]).toMatchObject({
      label: "Cintia Leffler",
      half: 5000,
      already: 1000,
      proposed: 4000,
    });
    expect(proposal.parts[0].proposed + proposal.parts[1].proposed).toBe(7000);
  });

  it("reconoce Leffly y Leffler", () => {
    expect(shareKeyFor({ first_name: "Marina", last_name: "Leffler" })).toBe("marina");
    expect(shareKeyFor({ first_name: "Cintia", last_name: "Leffly" })).toBe("cintia");
    expect(shareKeyFor({ first_name: "Otra", last_name: "Persona" })).toBeNull();
  });

  it("descuenta un retiro de otra persona antes de partir", () => {
    const proposal = buildShareProposal({
      sales: 10000,
      purchases: 0,
      adjustmentsTotal: 0,
      withdrawals: [
        { amount: 1000, partner: { first_name: "Otra", last_name: "Persona" } },
      ],
    });

    expect(proposal.otherWithdrawn).toBe(1000);
    expect(proposal.parts[0].half + proposal.parts[1].half).toBe(9000);
    expect(proposal.parts[0].proposed + proposal.parts[1].proposed).toBe(9000);
  });
});
