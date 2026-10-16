// Lectura de montos escritos a mano (convención es-CO): el punto SIEMPRE es separador de miles, la
// coma es el único decimal y, si el texto es ambiguo, se rechaza en vez de reinterpretarse.

import { describe, expect, it } from "vitest"
import { MONTO_INVALIDO, formatMontoInput, montoToInput, parseMontoInput } from "./presupuesto-ui"

describe("parseMontoInput", () => {
  it.each([
    ["", "0.00"],
    ["   ", "0.00"],
    ["0", "0.00"],
    ["1234", "1234.00"],
    ["1.234", "1234.00"],
    ["1.234.567", "1234567.00"],
    ["1.234.567,50", "1234567.50"],
    ["1500000,5", "1500000.50"],
    ["7.500,25", "7500.25"],
    ["59500000", "59500000.00"],
    [" 12.345 ", "12345.00"],
  ])("accepts %j as %j", (text, esperado) => {
    expect(parseMontoInput(text)).toBe(esperado)
  })

  it.each([
    ["1.23"], // backspace sobre «1.234»: antes se leía 1,23 en silencio
    ["1.234.56"], // backspace sobre «1.234.567»
    ["1.500,505"], // tercer decimal: antes se leía como miles (x1000)
    ["1234.50"], // decimal con punto: ambiguo en es-CO
    ["1234.5"],
    ["1.5"],
    ["1,2,3"],
    ["1.234,"],
    [",5x"],
    ["-5"],
    ["12abc"],
    ["abc"],
    ["1 234"],
  ])("rejects %j without reinterpreting it", (text) => {
    expect(parseMontoInput(text)).toBeNull()
  })

  it("explains that decimals take a comma", () => {
    expect(MONTO_INVALIDO).toMatch(/coma/i)
  })
})

describe("formatMontoInput", () => {
  it.each([
    ["1234", "1.234"],
    ["1234567", "1.234.567"],
    ["1.234.567,50", "1.234.567,50"],
    ["1234567,5", "1.234.567,5"],
    ["", ""],
    ["0", "0"],
  ])("groups %j as %j", (text, esperado) => {
    expect(formatMontoInput(text)).toBe(esperado)
  })

  it.each([["1.23"], ["1.500,505"], ["1234.50"], ["12abc"], ["-5"], ["1,"]])("leaves %j untouched", (text) => {
    expect(formatMontoInput(text)).toBe(text)
  })
})

describe("montoToInput", () => {
  it.each([
    ["59500000.00", "59500000"],
    ["1500000.50", "1500000,50"],
    ["7500.25", "7500,25"],
    ["0.00", "0"],
  ])("shows the stored %j as %j", (valor, esperado) => {
    expect(montoToInput(valor)).toBe(esperado)
  })

  it("round-trips through parseMontoInput", () => {
    for (const valor of ["59500000.00", "1500000.50", "7500.25", "0.05"]) {
      expect(parseMontoInput(montoToInput(valor))).toBe(valor)
    }
  })
})
