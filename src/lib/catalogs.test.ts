import {
  EstadoCliente,
  EstadoOportunidad,
  EstadoTarea,
  OrigenTarea,
  PrioridadCliente,
  PrioridadTarea,
  RolContacto,
  TipoCliente,
} from "@prisma/client"
import { describe, expect, it } from "vitest"
import {
  DOC_CATEGORIES,
  ENUM_VALUES,
  ESTADO_CLIENTE_LABELS,
  ESTADO_OPORTUNIDAD_LABELS,
  ESTADO_TAREA_LABELS,
  ORIGEN_TAREA_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  PRIORIDAD_TAREA_LABELS,
  RESTRICTED_DOC_CATEGORIES,
  ROL_CONTACTO_LABELS,
  TASK_TAGS,
  TIPO_CLIENTE_LABELS,
  type Catalog,
  type UiTone,
} from "./catalogs"

const VALID_TONES: UiTone[] = [
  "neutro",
  "activo",
  "info",
  "riesgo",
  "exito",
  "alerta",
  "destructivo",
]

const catalogs: {
  name: string
  prismaEnum: Record<string, string>
  labelMap: Catalog<string>
  enumValues: readonly string[]
}[] = [
  {
    name: "EstadoCliente",
    prismaEnum: EstadoCliente,
    labelMap: ESTADO_CLIENTE_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.EstadoCliente,
  },
  {
    name: "TipoCliente",
    prismaEnum: TipoCliente,
    labelMap: TIPO_CLIENTE_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.TipoCliente,
  },
  {
    name: "PrioridadCliente",
    prismaEnum: PrioridadCliente,
    labelMap: PRIORIDAD_CLIENTE_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.PrioridadCliente,
  },
  {
    name: "PrioridadTarea",
    prismaEnum: PrioridadTarea,
    labelMap: PRIORIDAD_TAREA_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.PrioridadTarea,
  },
  {
    name: "RolContacto",
    prismaEnum: RolContacto,
    labelMap: ROL_CONTACTO_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.RolContacto,
  },
  {
    name: "EstadoOportunidad",
    prismaEnum: EstadoOportunidad,
    labelMap: ESTADO_OPORTUNIDAD_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.EstadoOportunidad,
  },
  {
    name: "EstadoTarea",
    prismaEnum: EstadoTarea,
    labelMap: ESTADO_TAREA_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.EstadoTarea,
  },
  {
    name: "OrigenTarea",
    prismaEnum: OrigenTarea,
    labelMap: ORIGEN_TAREA_LABELS as Catalog<string>,
    enumValues: ENUM_VALUES.OrigenTarea,
  },
]

describe("catalogs completeness vs Prisma enums", () => {
  it.each(catalogs)(
    "every Prisma value of $name has a label with a valid tone",
    ({ prismaEnum, labelMap }) => {
      const values = Object.keys(prismaEnum)
      expect(values.length).toBeGreaterThan(0)
      for (const value of values) {
        const entry = labelMap[value]
        expect(entry, `missing catalog entry for ${value}`).toBeTruthy()
        expect(entry.label.trim().length, `empty label for ${value}`).toBeGreaterThan(0)
        expect(VALID_TONES, `invalid tone for ${value}`).toContain(entry.tone)
      }
    },
  )

  it.each(catalogs)(
    "$name: label map and ENUM_VALUES have exactly the Prisma values (no extras, no gaps)",
    ({ prismaEnum, labelMap, enumValues }) => {
      const prismaValues = Object.keys(prismaEnum).sort()
      expect(Object.keys(labelMap).sort()).toEqual(prismaValues)
      expect([...enumValues].sort()).toEqual(prismaValues)
    },
  )
})

describe("catalog labels", () => {
  it("ESTADO_CLIENTE_LABELS covers every estado del cliente", () => {
    expect(ESTADO_CLIENTE_LABELS.PROSPECTO.label).toBe("Prospecto")
    expect(ESTADO_CLIENTE_LABELS.CLIENTE_ACTIVO.label).toBe("Cliente activo")
    expect(ESTADO_CLIENTE_LABELS.CERRADO.tone).toBe("destructivo")
  })

  it("TIPO_CLIENTE_LABELS covers every tipo de cliente", () => {
    expect(TIPO_CLIENTE_LABELS.GOBIERNO_LOCAL.label).toBe("Gobierno local")
    expect(TIPO_CLIENTE_LABELS.COOPERANTE_MULTILATERAL.label).toBe("Cooperante multilateral")
    expect(TIPO_CLIENTE_LABELS.OTRO.label).toBe("Otro")
  })

  it("PRIORIDAD_CLIENTE_LABELS and PRIORIDAD_TAREA_LABELS share the same values", () => {
    expect(Object.keys(PRIORIDAD_CLIENTE_LABELS)).toEqual(Object.keys(PRIORIDAD_TAREA_LABELS))
    for (const key of Object.keys(PRIORIDAD_CLIENTE_LABELS) as Array<keyof typeof PRIORIDAD_CLIENTE_LABELS>) {
      expect(PRIORIDAD_CLIENTE_LABELS[key]).toEqual(PRIORIDAD_TAREA_LABELS[key])
    }
  })

  it("ESTADO_OPORTUNIDAD_LABELS covers the pipeline states", () => {
    expect(ESTADO_OPORTUNIDAD_LABELS.EN_NEGOCIACION.label).toBe("En negociación")
    expect(ESTADO_OPORTUNIDAD_LABELS.GANADA.tone).toBe("exito")
    expect(ESTADO_OPORTUNIDAD_LABELS.PERDIDA.tone).toBe("destructivo")
  })

  it("ESTADO_TAREA_LABELS covers the kanban states", () => {
    expect(ESTADO_TAREA_LABELS.POR_HACER.label).toBe("Por hacer")
    expect(ESTADO_TAREA_LABELS.BLOQUEADA.label).toBe("Bloqueada")
  })

  it("ORIGEN_TAREA_LABELS covers every origen", () => {
    expect(ORIGEN_TAREA_LABELS.CRM.label).toBe("CRM")
    expect(ORIGEN_TAREA_LABELS.KANBAN.label).toBe("Kanban")
    expect(ORIGEN_TAREA_LABELS.AMBOS.label).toBe("Ambos")
  })
})

describe("task tags and doc categories", () => {
  it("TASK_TAGS are non-empty unique strings", () => {
    expect(new Set(TASK_TAGS).size).toBe(TASK_TAGS.length)
    for (const tag of TASK_TAGS) expect(tag.trim().length).toBeGreaterThan(0)
  })

  it("DOC_CATEGORIES are non-empty unique strings", () => {
    expect(new Set(DOC_CATEGORIES).size).toBe(DOC_CATEGORIES.length)
    for (const categoria of DOC_CATEGORIES) {
      expect(categoria.trim().length).toBeGreaterThan(0)
    }
  })

  it("RESTRICTED_DOC_CATEGORIES is a subset of DOC_CATEGORIES", () => {
    for (const categoria of RESTRICTED_DOC_CATEGORIES) {
      expect(DOC_CATEGORIES).toContain(categoria)
    }
  })
})