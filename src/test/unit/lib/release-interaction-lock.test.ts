import { describe, expect, it } from "vitest";
import { releaseStuckInteractionLock } from "@/lib/release-interaction-lock";

describe("releaseStuckInteractionLock", () => {
  it("suelta pointer-events e inert cuando no hay una capa abierta", () => {
    document.body.style.pointerEvents = "none";
    const app = document.createElement("div");
    app.setAttribute("data-suppressed", "");
    app.setAttribute("inert", "");
    app.setAttribute("aria-hidden", "true");
    document.body.appendChild(app);

    expect(releaseStuckInteractionLock()).toBe(true);
    expect(document.body.style.pointerEvents).toBe("");
    expect(app.hasAttribute("inert")).toBe(false);
    expect(app.hasAttribute("aria-hidden")).toBe(false);
    expect(app.hasAttribute("data-suppressed")).toBe(false);

    app.remove();
  });

  it("no toca el lock mientras hay un diálogo abierto", () => {
    document.body.style.pointerEvents = "none";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);

    expect(releaseStuckInteractionLock()).toBe(false);
    expect(document.body.style.pointerEvents).toBe("none");

    dialog.remove();
    document.body.style.pointerEvents = "";
  });
});
