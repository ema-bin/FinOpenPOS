const OPEN_LAYER =
  '[role="dialog"][data-state="open"], [role="listbox"][data-state="open"], [role="menu"][data-state="open"]';

/**
 * Radix (diálogos, selects y popovers) a veces cierra la capa y deja
 * `pointer-events: none` o `inert` en el body. Sin esto, la app no responde
 * hasta refrescar.
 */
export function releaseStuckInteractionLock(doc: Document = document): boolean {
  if (doc.querySelector(OPEN_LAYER)) return false;

  let released = false;
  if (doc.body.style.pointerEvents === "none") {
    doc.body.style.pointerEvents = "";
    released = true;
  }

  doc.querySelectorAll("[data-suppressed]").forEach((el) => {
    el.removeAttribute("inert");
    el.removeAttribute("aria-hidden");
    el.removeAttribute("data-suppressed");
    released = true;
  });

  return released;
}
