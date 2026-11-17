export async function signageApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && typeof body.error === "string" ? body.error : "No se pudo completar";
    throw new Error(message);
  }
  return body as T;
}

export function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  };
}
