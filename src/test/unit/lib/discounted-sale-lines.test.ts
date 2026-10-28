import { describe, expect, it } from "vitest";
import {
  allocateDiscountedAmounts,
  summarizeDiscountedLines,
} from "@/lib/discounted-sale-lines";

describe("allocateDiscountedAmounts", () => {
  it("deja en 800 un producto de 1000 con 20% de descuento", () => {
    expect(allocateDiscountedAmounts([1000], 800)).toEqual([800]);
  });

  it("cierra la suma en el total cobrado cuando el reparto deja centavos", () => {
    const amounts = allocateDiscountedAmounts([1000, 333], 1199.7);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(1199.7, 2);
  });
});

describe("summarizeDiscountedLines", () => {
  it("usa el precio con descuento en el producto y en la categoría", () => {
    const summary = summarizeDiscountedLines(
      [
        {
          id: 1,
          total_amount: 800,
          discount_percentage: 20,
          discount_amount: 0,
        },
      ],
      [
        {
          orderId: 1,
          quantity: 1,
          lineTotal: 1000,
          cantina: true,
          productId: 7,
          productName: "Gaseosa",
          categoryId: 3,
          categoryName: "Bebidas",
        },
      ]
    );

    expect(summary.byProduct).toEqual([
      {
        productId: 7,
        productName: "Gaseosa",
        categoryId: 3,
        categoryName: "Bebidas",
        quantitySold: 1,
        totalAmount: 800,
      },
    ]);
    expect(summary.byCategory[0].totalAmount).toBe(800);
    expect(summary.totalDiscount).toBe(200);
    expect(summary.byProduct.reduce((sum, row) => sum + row.totalAmount, 0)).toBe(800);
  });

  it("reparte un importe fijo en proporción al precio de lista", () => {
    const summary = summarizeDiscountedLines(
      [
        {
          id: 2,
          total_amount: 1200,
          discount_percentage: null,
          discount_amount: 300,
        },
      ],
      [
        {
          orderId: 2,
          quantity: 1,
          lineTotal: 1000,
          cantina: true,
          productId: 1,
          productName: "A",
          categoryId: 1,
          categoryName: "Bar",
        },
        {
          orderId: 2,
          quantity: 2,
          lineTotal: 500,
          cantina: true,
          productId: 2,
          productName: "B",
          categoryId: 1,
          categoryName: "Bar",
        },
      ]
    );

    expect(summary.byProduct.find((row) => row.productId === 1)?.totalAmount).toBe(800);
    expect(summary.byProduct.find((row) => row.productId === 2)?.totalAmount).toBe(400);
    expect(summary.byCategory[0].totalAmount).toBe(1200);
  });

  it("no suma a la cantina el descuento que corresponde a otra línea", () => {
    const summary = summarizeDiscountedLines(
      [
        {
          id: 3,
          total_amount: 1600,
          discount_percentage: 20,
          discount_amount: null,
        },
      ],
      [
        {
          orderId: 3,
          quantity: 1,
          lineTotal: 1000,
          cantina: true,
          productId: 1,
          productName: "A",
          categoryId: 1,
          categoryName: "Bar",
        },
        {
          orderId: 3,
          quantity: 1,
          lineTotal: 1000,
          cantina: false,
          productId: 9,
          productName: "Cancha",
          categoryId: 8,
          categoryName: "Canchas",
        },
      ]
    );

    expect(summary.byProduct).toHaveLength(1);
    expect(summary.byProduct[0].totalAmount).toBe(800);
  });
});
