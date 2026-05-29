export function formatCategoryHeaderLabel(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return "";
  if (/\bCAT\.?$/i.test(trimmed)) return trimmed;
  return `${trimmed} CAT`;
}

export function shouldShowCategoryShareHeader(
  isCategorySpecific?: boolean,
  category?: string | null,
): boolean {
  return !!isCategorySpecific && !!formatCategoryHeaderLabel(category ?? "");
}
