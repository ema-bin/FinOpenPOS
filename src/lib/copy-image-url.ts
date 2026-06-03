export class CopyImageError extends Error {
  constructor(
    message: string,
    readonly code: "fetch" | "clipboard" | "unsupported"
  ) {
    super(message);
    this.name = "CopyImageError";
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
    img.src = src;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob falló"))),
      "image/png"
    );
  });
}

/** Convierte cualquier imagen a PNG (formato que el portapapeles acepta mejor). */
export async function imageBlobToPng(source: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const img = await loadImageElement(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(img, 0, 0);
    return await canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** PNG ya preparado (ideal: precargado en useTournamentFlyerBlob). */
export async function copyPngBlobToClipboard(pngBlob: Blob): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    throw new CopyImageError(
      "Este navegador no permite copiar imágenes al portapapeles",
      "unsupported"
    );
  }

  const attempts: Array<() => Promise<void>> = [
    () =>
      navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]),
    () =>
      navigator.clipboard.write([
        new ClipboardItem({ "image/png": Promise.resolve(pngBlob) }),
      ]),
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  console.error("clipboard.write failed:", lastErr);
  throw new CopyImageError(
    "No se pudo escribir en el portapapeles. Usá Chrome o Edge actualizado.",
    "clipboard"
  );
}

/** Convierte y copia (más lento; puede fallar el gesto del click). */
export async function copyImageBlobToClipboard(source: Blob): Promise<void> {
  const png = await imageBlobToPng(source);
  await copyPngBlobToClipboard(png);
}

export function tournamentFlyerBlobUrl(tournamentId: number): string {
  return `/api/tournaments/${tournamentId}/promo-flyer/blob`;
}

/** Precarga el flier vía API (mismo origen, sin CORS). */
export async function fetchTournamentFlyerBlob(
  tournamentId: number
): Promise<Blob> {
  const res = await fetch(tournamentFlyerBlobUrl(tournamentId), {
    credentials: "include",
  });
  if (!res.ok) {
    throw new CopyImageError("No se pudo cargar el flier", "fetch");
  }
  return res.blob();
}

/**
 * @deprecated Preferí prefetch + copyImageBlobToClipboard en el click.
 */
export async function copyImageFromUrl(
  _imageUrl: string,
  options?: { fetchUrl?: string }
): Promise<void> {
  const match = options?.fetchUrl?.match(/\/tournaments\/(\d+)\/promo-flyer\/blob/);
  if (match) {
    const blob = await fetchTournamentFlyerBlob(Number(match[1]));
    await copyImageBlobToClipboard(blob);
    return;
  }
  throw new CopyImageError(
    "Usá copyImageBlobToClipboard con el flier precargado",
    "fetch"
  );
}

export async function downloadImageBlob(
  blob: Blob,
  filename: string
): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
