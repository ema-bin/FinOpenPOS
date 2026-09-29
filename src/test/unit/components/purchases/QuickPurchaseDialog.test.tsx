import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickPurchaseDialog } from "@/components/purchases/QuickPurchaseDialog";

vi.mock("@/services", () => ({
  purchasesService: {
    quickPurchase: vi.fn(),
  },
}));

function renderDialog(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickPurchaseDialog
        open={open}
        onOpenChange={() => {}}
        paymentMethods={[{ id: 1, name: "Efectivo" }]}
      />
    </QueryClientProvider>
  );
}

describe("QuickPurchaseDialog (components)", () => {
  it("muestra título y método de pago", () => {
    renderDialog();
    expect(screen.getByText("Compra rápida")).toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByLabelText(/Monto/i)).toBeInTheDocument();
  });

  it("deshabilita registrar sin monto", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /Registrar compra/i })).toBeDisabled();
  });
});
