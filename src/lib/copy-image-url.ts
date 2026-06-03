/** Copia una imagen remota al portapapeles (para pegar en WhatsApp, etc.). */
export async function copyImageFromUrl(imageUrl: string): Promise<void> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error("No se pudo descargar la imagen");
  const blob = await res.blob();
  const type = blob.type.startsWith("image/") ? blob.type : "image/png";
  await navigator.clipboard.write([
    new ClipboardItem({ [type]: blob }),
  ]);
}
