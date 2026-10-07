import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copySharePlayoffsBracketToClipboard } from "@/lib/copy-share-playoffs-bracket";
import {
  installMockCanvas2d,
  uninstallMockCanvas2d,
} from "@/test/helpers/mock-canvas-2d";

const toPng = vi.fn();

vi.mock("html-to-image", () => ({
  toPng,
}));

describe("copy-share-playoffs-bracket (lib)", () => {
  beforeEach(() => {
    installMockCanvas2d();
    vi.useFakeTimers();
    toPng.mockResolvedValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    );

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      }
    );

    vi.stubGlobal(
      "ClipboardItem",
      class ClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      }
    );

    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });

    HTMLCanvasElement.prototype.toBlob = function (
      callback: BlobCallback | null
    ) {
      callback?.(new Blob(["png"], { type: "image/png" }));
    };

    class MockImage {
      width = 2;
      height = 2;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);
  });

  afterEach(() => {
    vi.useRealTimers();
    uninstallMockCanvas2d();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("activa layout de exportación y copia PNG al portapapeles", async () => {
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    const layoutChanges: boolean[] = [];

    const run = copySharePlayoffsBracketToClipboard(el, (v) =>
      layoutChanges.push(v)
    );

    await vi.advanceTimersByTimeAsync(400);
    await run;

    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(layoutChanges).toEqual([true, false]);
    expect(el.classList.contains("minimal-bracket-exporting")).toBe(false);
    expect(toPng).toHaveBeenCalled();
    expect(navigator.clipboard.write).toHaveBeenCalled();
  });

  it("excluye nodos con data-share-playoffs-exclude en el filter de toPng", async () => {
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    const excluded = document.createElement("span");
    excluded.setAttribute("data-share-playoffs-exclude", "1");
    el.appendChild(excluded);

    const run = copySharePlayoffsBracketToClipboard(el, () => {});
    await vi.advanceTimersByTimeAsync(400);
    await run;

    const options = toPng.mock.calls[0][1];
    expect(options.filter(excluded)).toBe(false);
    expect(options.filter(el)).toBe(true);
  });

  it("restaura layout si toPng falla", async () => {
    toPng.mockRejectedValueOnce(new Error("capture failed"));
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    const layoutChanges: boolean[] = [];

    const run = copySharePlayoffsBracketToClipboard(el, (v) =>
      layoutChanges.push(v)
    );
    const assertion = expect(run).rejects.toThrow(/capture failed/);
    await vi.advanceTimersByTimeAsync(400);
    await assertion;
    expect(layoutChanges).toEqual([true, false]);
    expect(el.classList.contains("minimal-bracket-exporting")).toBe(false);
  });
});
