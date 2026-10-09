// @vitest-environment node
import { describe, expect, it } from "vitest";
import { apiError } from "@/lib/api/errors";

describe("apiError", () => {
  it("keeps the plain { error, code } envelope", async () => {
    const response = apiError("Falta algo.", 400, "VALIDATION_ERROR");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Falta algo.", code: "VALIDATION_ERROR" });
  });

  it("carries extra keys such as the import report next to the envelope", async () => {
    const reporte = { errores: [{ regla: "V-12" }], truncado: false };
    const response = apiError("La plantilla tiene errores.", 400, "VALIDATION_ERROR", { reporte });
    expect(await response.json()).toEqual({
      error: "La plantilla tiene errores.",
      code: "VALIDATION_ERROR",
      reporte,
    });
  });

  it("never lets an extra key overwrite the error or code", async () => {
    const response = apiError("Real.", 409, "CONFLICT", { error: "forjado", code: "OTRO" });
    expect(await response.json()).toEqual({ error: "Real.", code: "CONFLICT" });
  });
});
