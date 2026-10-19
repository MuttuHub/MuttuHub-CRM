import { describe, expect, it } from "vitest"
import { formatoSoporte } from "./soportes-format"

describe("formatoSoporte", () => {
  it.each([
    [{ tipo: "archivo", nombre: "acta.pdf", url_externa: null }, "PDF"],
    [{ tipo: "archivo", nombre: "sin-extension", url_externa: null }, "Archivo"],
    [{ tipo: "archivo", nombre: "archivo.extensionlarga", url_externa: null }, "Archivo"],
    [{ tipo: "enlace", nombre: "Carpeta", url_externa: "https://drive.google.com/x" }, "Drive"],
    [{ tipo: "enlace", nombre: "Carpeta", url_externa: "https://docs.example/x" }, "Enlace"],
    [{ tipo: "enlace", nombre: "Carpeta", url_externa: null }, "Enlace"],
  ] as const)("labels %j as %s", (soporte, esperado) => {
    expect(formatoSoporte(soporte)).toBe(esperado)
  })
})
