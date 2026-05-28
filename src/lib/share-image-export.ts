export const SHARE_EXPORT_BG = "#0f2418";

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
