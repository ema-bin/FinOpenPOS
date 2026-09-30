import { describe, expect, it } from "vitest";
import {
  BRACKET_SHARE_LAYOUT,
  BRACKET_SHARE_LAYOUT_EXPORT,
  bracketLayoutCssVars,
  getFirstRoundSlotHeight,
} from "@/lib/playoffs-bracket-share-layout";

describe("playoffs-bracket-share-layout (lib)", () => {
  it("getFirstRoundSlotHeight suma slotUnit, gaps y timeBlock", () => {
    expect(getFirstRoundSlotHeight(BRACKET_SHARE_LAYOUT)).toBe(
      13 * 2 + 0 + 5 + 0 + 13 * 2
    );
    expect(getFirstRoundSlotHeight(BRACKET_SHARE_LAYOUT_EXPORT)).toBe(
      70 * 2 + 6 + 26 + 6 + 70 * 2
    );
  });

  it("bracketLayoutCssVars expone variables CSS en px", () => {
    const vars = bracketLayoutCssVars(BRACKET_SHARE_LAYOUT);
    expect(vars["--mb-slot-unit"]).toBe("13px");
    expect(vars["--mb-col-w-first"]).toBe("164px");
    expect(vars["--mb-gap-cols"]).toBe("3px");
  });

  it("layout de exportación es más grande que el de pantalla", () => {
    expect(BRACKET_SHARE_LAYOUT_EXPORT.slotUnit).toBeGreaterThan(
      BRACKET_SHARE_LAYOUT.slotUnit
    );
    expect(BRACKET_SHARE_LAYOUT_EXPORT.colWFirst).toBeGreaterThan(
      BRACKET_SHARE_LAYOUT.colWFirst
    );
  });
});
