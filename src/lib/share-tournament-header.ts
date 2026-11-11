export function formatCategoryHeaderLabel(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return "";
  if (/\bCAT\.?$/i.test(trimmed)) return trimmed;
  return `${trimmed} CAT`;
}

/** Baja el tamaño solo si el texto no entra en el ancho libre al lado del logo. */
export function fittedFontSizePx(
  textWidthAtMax: number,
  available: number,
  maxPx: number,
  minPx: number
): number {
  if (available <= 0 || textWidthAtMax <= 0 || maxPx <= 0) return maxPx;
  if (textWidthAtMax <= available) return maxPx;
  const scaled = Math.floor((maxPx * available) / textWidthAtMax);
  return Math.max(minPx, Math.min(maxPx, scaled));
}

export function shouldShowCategoryShareHeader(
  isCategorySpecific?: boolean,
  category?: string | null,
): boolean {
  return !!isCategorySpecific && !!formatCategoryHeaderLabel(category ?? "");
}
