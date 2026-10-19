// Step 1 once the project exists: a read-only summary of what was created (no second create form).

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { PasoGeneralCreado } from "./paso-general"

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento de capacidades locales",
  estado: "BORRADOR",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [{ id: "l1", codigo: "LE-01", nombre: "Educación", principal: true }],
  municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
}

describe("PasoGeneralCreado", () => {
  it("summarises the created project with code, state, client, value, lines and municipios", () => {
    render(<PasoGeneralCreado proyecto={PROYECTO} />)

    expect(screen.getByText("PRY-2026-001")).toBeInTheDocument()
    expect(screen.getByText("Borrador")).toBeInTheDocument()
    expect(screen.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(screen.getByText("Educación")).toBeInTheDocument()
    expect(screen.getByText("Barranquilla")).toBeInTheDocument()
    expect(screen.getByText(/180\.000\.000/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Crear proyecto/ })).not.toBeInTheDocument()
  })

  it("shows a dash instead of an empty value", () => {
    render(<PasoGeneralCreado proyecto={{ ...PROYECTO, valor_total: null, responsable: null, lineas: [] }} />)
    expect(screen.getByText("Sin asignar")).toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2)
  })
})
