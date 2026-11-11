import { describe, expect, it } from "vitest";
import { apiError, PERMISSION_DENIED_MESSAGE } from "@/lib/api-error";

describe("apiError", () => {
  it("un 403 se muestra como falta de permiso", async () => {
    const response = new Response(JSON.stringify({ error: "otra cosa" }), { status: 403 });
    const error = await apiError(response, "No se pudo guardar");
    expect(error.message).toBe(PERMISSION_DENIED_MESSAGE);
  });

  it("otro error usa el mensaje de la API", async () => {
    const response = new Response(JSON.stringify({ error: "El cierre ya existe" }), { status: 400 });
    const error = await apiError(response, "No se pudo guardar");
    expect(error.message).toBe("El cierre ya existe");
  });

  it("sin cuerpo usa el texto de respaldo", async () => {
    const response = new Response("no", { status: 500 });
    const error = await apiError(response, "No se pudo guardar");
    expect(error.message).toBe("No se pudo guardar");
  });
});
