export class CopyImageError extends Error {
  constructor(
    message: string,
    readonly code: "fetch" | "clipboard" | "unsupported"
  ) {
    super(message);
    this.name = "CopyImageError";
  }
}

function normalizeImageBlob(blob: Blob): Blob {
  const type = blob.type?.split(";")[0]?.trim() ?? "";
  if (type === "image/png" || type === "image/jpeg" || type === "image/webp") {
    return blob;
  }
  return new Blob([blob], { type: "image/png" });
}

async function fetchImageBlob(imageUrl: string, fetchUrl?: string): Promise<Blob> {
  const url = fetchUrl ?? imageUrl;
  const res = await fetch(url, {
    credentials: fetchUrl ? "include" : "omit",
    mode: fetchUrl ? "same-origin" : "cors",
  });
  if (!res.ok) {
    throw new CopyImageError("No se pudo descargar la imagen", "fetch");
  }
  return normalizeImageBlob(await res.blob());
}

/**
 * Copia una imagen al portapapeles.
 * En producción, pasá `fetchUrl` apuntando a un proxy same-origin (evita CORS de Storage).
 */
export async function copyImageFromUrl(
  imageUrl: string,
  options?: { fetchUrl?: string }
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    throw new CopyImageError(
      "Este navegador no permite copiar imágenes al portapapeles",
      "unsupported"
    );
  }

  let blob: Blob;
  try {
    blob = await fetchImageBlob(imageUrl, options?.fetchUrl);
  } catch (firstErr) {
    if (options?.fetchUrl) {
      throw firstErr;
    }
    blob = await fetchImageBlob(imageUrl);
  }

  const type = blob.type || "image/png";
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [type]: Promise.resolve(blob),
      }),
    ]);
  } catch {
    throw new CopyImageError(
      "El navegador bloqueó la copia. Probá Chrome/Edge o pegá desde «Flier Promoción» tras descargar.",
      "clipboard"
    );
  }
}

/** Descarga la imagen como archivo (fallback si falla el portapapeles). */
export async function downloadImageFromUrl(
  imageUrl: string,
  filename: string,
  options?: { fetchUrl?: string }
): Promise<void> {
  const blob = await fetchImageBlob(imageUrl, options?.fetchUrl);
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
