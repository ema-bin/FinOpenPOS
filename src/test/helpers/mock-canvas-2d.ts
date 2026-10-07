import { vi } from "vitest";

/** jsdom no implementa getContext("2d"); stub mínimo para tests de export/share. */
export function installMockCanvas2d() {
  const ctx = {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx);
  return ctx;
}

export function uninstallMockCanvas2d() {
  // @ts-expect-error restore prototype
  delete HTMLCanvasElement.prototype.getContext;
}
