import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  scaleCanvasToInstagramStory,
  scaleCanvasToShareWidth,
  SHARE_EXPORT_BG,
  SHARE_EXPORT_PORTRAIT,
} from "@/lib/share-image-export";
import {
  installMockCanvas2d,
  uninstallMockCanvas2d,
} from "@/test/helpers/mock-canvas-2d";

function canvasWithSize(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

describe("share-image-export (lib)", () => {
  beforeEach(() => installMockCanvas2d());
  afterEach(() => uninstallMockCanvas2d());
  it("scaleCanvasToShareWidth escala al ancho de salida con padding", () => {
    const src = canvasWithSize(200, 100);
    const out = scaleCanvasToShareWidth(src, 1080, 32, SHARE_EXPORT_BG);
    expect(out.width).toBe(1080);
    expect(out.height).toBeGreaterThan(100);
  });

  it("scaleCanvasToInstagramStory produce lienzo 9:16", () => {
    const src = canvasWithSize(400, 300);
    const out = scaleCanvasToInstagramStory(src, SHARE_EXPORT_BG, 6);
    expect(out.width).toBe(SHARE_EXPORT_PORTRAIT.width);
    expect(out.height).toBe(SHARE_EXPORT_PORTRAIT.height);
  });
});
