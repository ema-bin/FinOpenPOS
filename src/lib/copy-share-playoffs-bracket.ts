import { flushSync } from "react-dom";
import {
  SHARE_EXPORT_BG,
  SHARE_EXPORT_PAD,
  scaleCanvasToInstagramStory,
  scaleCanvasToShareWidth,
} from "@/lib/share-image-export";

export type CopySharePlayoffsBracketOptions = {
  /** Vertical 1080×1920 — se lee mejor en WhatsApp al abrir en el celular. */
  portrait?: boolean;
};

/** Copia el cuadro minimalista al portapapeles; activa layout de exportación durante la captura. */
export async function copySharePlayoffsBracketToClipboard(
  el: HTMLElement,
  onExportLayoutChange: (exporting: boolean) => void,
  options: CopySharePlayoffsBracketOptions = {},
): Promise<void> {
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  await new Promise((resolve) => setTimeout(resolve, 400));

  flushSync(() => onExportLayoutChange(true));
  el.classList.add("minimal-bracket-exporting");
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const { toPng } = await import("html-to-image");

    await new Promise<void>((resolve) => {
      const logo = new Image();
      logo.crossOrigin = "anonymous";
      logo.onload = () => resolve();
      logo.onerror = () => resolve();
      logo.src = "/PCP-logo.png";
    });

    const dataUrl = await toPng(el, {
      pixelRatio: 1,
      backgroundColor: SHARE_EXPORT_BG,
      cacheBust: true,
      filter: (node: Node) => {
        if (node instanceof HTMLElement) {
          return !node.closest("[data-share-playoffs-exclude]");
        }
        return true;
      },
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    const raw = document.createElement("canvas");
    raw.width = img.width;
    raw.height = img.height;
    raw.getContext("2d")!.drawImage(img, 0, 0);

    const pad = options.portrait ? 6 : SHARE_EXPORT_PAD;
    const canvas = options.portrait
      ? scaleCanvasToInstagramStory(raw, SHARE_EXPORT_BG, pad)
      : scaleCanvasToShareWidth(raw, 1080, pad, SHARE_EXPORT_BG);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 1),
    );
    if (!blob) throw new Error("Error al generar imagen");

    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } finally {
    el.classList.remove("minimal-bracket-exporting");
    flushSync(() => onExportLayoutChange(false));
  }
}
