import { describe, expect, it } from "vitest";
import { fittedFontSizePx, formatCategoryHeaderLabel } from "@/lib/share-tournament-header";

describe("título de los flyers", () => {
  it("agrega CAT al nombre de la categoría", () => {
    expect(formatCategoryHeaderLabel("principiantes")).toBe("principiantes CAT");
    expect(formatCategoryHeaderLabel("4ta CAT")).toBe("4ta CAT");
  });

  it("achica el título largo y deja igual al que entra", () => {
    expect(fittedFontSizePx(340, 260, 39, 16)).toBe(29);
    expect(fittedFontSizePx(180, 260, 39, 16)).toBe(39);
    expect(fittedFontSizePx(900, 80, 39, 16)).toBe(16);
  });
});
