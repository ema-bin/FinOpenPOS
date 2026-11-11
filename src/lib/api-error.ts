export const PERMISSION_DENIED_MESSAGE = "No tenés permiso para esto.";

export function isPermissionDenied(status: number): boolean {
  return status === 401 || status === 403;
}

/** Error para mostrar en un toast. Un 401 o 403 no se reemplaza por el texto genérico de la acción. */
export async function apiError(response: Response, fallback: string): Promise<Error> {
  if (isPermissionDenied(response.status)) {
    return new Error(PERMISSION_DENIED_MESSAGE);
  }
  const data = await response.json().catch(() => null);
  const record = data && typeof data === "object" ? (data as { error?: unknown; message?: unknown }) : null;
  const message =
    (typeof record?.error === "string" && record.error) ||
    (typeof record?.message === "string" && record.message) ||
    "";
  return new Error(message || fallback);
}
