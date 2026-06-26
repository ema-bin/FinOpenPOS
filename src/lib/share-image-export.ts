export const SHARE_EXPORT_BG = "#0f2418";

/** Formato vertical para redes / celular (9:16). */
export const SHARE_EXPORT_PORTRAIT = {
  width: 1080,
  height: 1920,
} as const;

export const SHARE_EXPORT_PAD = 32;

/** Ancho fijo de la vista previa / captura vertical (px). */
export const SHARE_PORTRAIT_CAPTURE_WIDTH = 400;

export function scaleCanvasToShareWidth(
  src: HTMLCanvasElement,
  outWidth: number,
  pad: number,
  backgroundColor: string,
): HTMLCanvasElement {
  const scale = (outWidth - pad * 2) / src.width;
  const drawH = src.height * scale;
  const out = document.createElement("canvas");
  out.width = outWidth;
  out.height = Math.ceil(drawH + pad * 2);
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, pad, pad, src.width * scale, drawH);
  return out;
}

/** Escala el contenido para entrar en un lienzo vertical fijo, centrado. */
export function scaleCanvasToSharePortrait(
  src: HTMLCanvasElement,
  outWidth: number,
  outHeight: number,
  pad: number,
  backgroundColor: string,
): HTMLCanvasElement {
  const maxW = outWidth - pad * 2;
  const maxH = outHeight - pad * 2;
  const scale = Math.min(maxW / src.width, maxH / src.height);
  const drawW = src.width * scale;
  const drawH = src.height * scale;
  const x = pad + (maxW - drawW) / 2;
  const y = pad + (maxH - drawH) / 2;

  const out = document.createElement("canvas");
  out.width = outWidth;
  out.height = outHeight;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, x, y, drawW, drawH);
  return out;
}

/**
 * Export 9:16 (Instagram Story / Reels): 1080×1920, contenido escalado y centrado.
 */
export function scaleCanvasToInstagramStory(
  src: HTMLCanvasElement,
  backgroundColor: string,
  pad: number = SHARE_EXPORT_PAD,
): HTMLCanvasElement {
  return scaleCanvasToSharePortrait(
    src,
    SHARE_EXPORT_PORTRAIT.width,
    SHARE_EXPORT_PORTRAIT.height,
    pad,
    backgroundColor,
  );
}

export type CaptureShareElementOptions = {
  backgroundColor: string;
  excludeAttribute?: string;
  /** Fuerza ancho de captura (evita franja estrecha a la izquierda). */
  captureWidth?: number;
};

/** Captura el nodo completo (scrollHeight) para no cortar sponsors ni pie. */
export async function captureShareElementToPng(
  element: HTMLElement,
  options: CaptureShareElementOptions,
): Promise<string> {
  const { toPng } = await import("html-to-image");
  const excludeAttr = options.excludeAttribute ?? "data-share-capture-exclude";

  const width = Math.max(
    options.captureWidth ?? 0,
    element.scrollWidth,
    element.offsetWidth,
  );
  const height = element.scrollHeight;

  return toPng(element, {
    pixelRatio: 2,
    backgroundColor: options.backgroundColor,
    cacheBust: true,
    width,
    height,
    filter: (node: Node) => {
      if (node instanceof HTMLElement && node.closest(`[${excludeAttr}]`)) {
        return false;
      }
      return true;
    },
  });
}
