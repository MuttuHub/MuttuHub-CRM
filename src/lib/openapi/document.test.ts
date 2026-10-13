// Guards the OpenAPI assembly itself: `document.ts` wires the v2 catalog
// registrations by side-effect import, so a broken or removed import would
// silently drop `/api/v1/rubros` or `/api/v1/strategic-lines` from the published
// spec. `tsc` cannot see that regression — only building the document can.

import { describe, expect, it } from "vitest"

import { buildOpenApiDocument } from "@/lib/openapi/document"

describe("buildOpenApiDocument", () => {
  it("builds the 3.1 document and exposes the v2 catalog paths with their methods", () => {
    const document = buildOpenApiDocument()
    const paths = document.paths ?? {}

    expect(document.openapi).toBe("3.1.0")

    expect(paths["/api/v1/rubros"]).toEqual(
      expect.objectContaining({ get: expect.anything() }),
    )
    expect(paths["/api/v1/rubros/{id}"]).toEqual(
      expect.objectContaining({ patch: expect.anything(), delete: expect.anything() }),
    )

    expect(paths["/api/v1/strategic-lines"]).toEqual(
      expect.objectContaining({ get: expect.anything(), post: expect.anything() }),
    )
    expect(paths["/api/v1/strategic-lines/{id}"]).toEqual(
      expect.objectContaining({ patch: expect.anything(), delete: expect.anything() }),
    )
  })

  it("registers the semaforo v2 parameters path (GET + PATCH)", () => {
    const paths = buildOpenApiDocument().paths ?? {}

    expect(paths["/api/v1/settings/semaforo-v2"]).toEqual(
      expect.objectContaining({ get: expect.anything(), patch: expect.anything() }),
    )
  })

  it("registers the S2.3 project operations with their status codes and body shape", () => {
    const document = buildOpenApiDocument()
    const paths = document.paths ?? {}

    // E-03: POST /api/v1/projects -> 201 { proyecto }.
    const create = paths["/api/v1/projects"]
    expect(create?.post).toBeDefined()
    expect(Object.keys(create?.post?.responses ?? {})).toEqual(expect.arrayContaining(["201"]))

    // E-03 carries cliente_id in the body (E-05 derives it from the URL) and,
    // since S2.6 T4, accepts the initial team.
    const createBodySchema = create?.post?.requestBody as
      | { content?: Record<string, { schema?: Record<string, unknown> }> }
      | undefined
    const createProperties =
      (createBodySchema?.content?.["application/json"]?.schema as
        | { properties?: Record<string, unknown> }
        | undefined)?.properties ?? {}
    expect(Object.keys(createProperties)).toContain("cliente_id")
    expect(Object.keys(createProperties)).toContain("miembro_ids")

    // E-04: GET /api/v1/projects/eligible-opportunities -> 200 { oportunidades }.
    const eligible = paths["/api/v1/projects/eligible-opportunities"]
    expect(eligible?.get).toBeDefined()
    expect(Object.keys(eligible?.get?.responses ?? {})).toEqual(expect.arrayContaining(["200"]))

    // E-05: POST .../project -> 201 { proyecto }; its body omits cliente_id
    // (derived from the URL) and its params are opaque ids, not uuids.
    const fromOpportunity =
      paths["/api/v1/clients/{id}/opportunities/{opportunityId}/project"]
    expect(fromOpportunity?.post).toBeDefined()
    expect(Object.keys(fromOpportunity?.post?.responses ?? {})).toEqual(
      expect.arrayContaining(["201"]),
    )

    const requestBody = fromOpportunity?.post?.requestBody as
      | { content?: Record<string, { schema?: Record<string, unknown> }> }
      | undefined
    const bodySchema = requestBody?.content?.["application/json"]?.schema
    expect(bodySchema).toBeDefined()
    const properties =
      (bodySchema as { properties?: Record<string, unknown> })?.properties ?? {}
    expect(Object.keys(properties)).toContain("responsable_id")
    expect(Object.keys(properties)).not.toContain("cliente_id")
    // S2.6 T4: E-05 shares the E-03 base, so it also accepts the initial team.
    expect(Object.keys(properties)).toContain("miembro_ids")

    // P02 history reader: GET /api/v1/projects/{id}/audit -> 200 { historial },
    // with the same existence/visibility gate as the detail route.
    const audit = paths["/api/v1/projects/{id}/audit"]
    expect(audit?.get).toBeDefined()
    expect(Object.keys(audit?.get?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "403", "404"]),
    )
  })

  it("registers the S2.6 project team membership operations with their status codes", () => {
    const document = buildOpenApiDocument()
    const paths = document.paths ?? {}

    // E-07: GET/POST /api/v1/projects/{id}/members.
    const members = paths["/api/v1/projects/{id}/members"]
    expect(members?.get).toBeDefined()
    expect(members?.post).toBeDefined()
    expect(Object.keys(members?.get?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "401", "403", "404"]),
    )
    // The duplicate answer is the index-driven 409, so it must be documented.
    expect(Object.keys(members?.post?.responses ?? {})).toEqual(
      expect.arrayContaining(["201", "400", "403", "404", "409"]),
    )

    // E-07: DELETE /api/v1/projects/{id}/members/{userId} (soft removal).
    const remove = paths["/api/v1/projects/{id}/members/{userId}"]
    expect(remove?.delete).toBeDefined()
    expect(Object.keys(remove?.delete?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "403", "404"]),
    )
  })

  it("registers the S3 technical-structure operations with their status codes", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})

    // U1: objectives.
    const objectives = paths["/api/v1/projects/{id}/objectives"]
    expect(codes(objectives?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(objectives?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    const objective = paths["/api/v1/projects/{id}/objectives/{objectiveId}"]
    expect(codes(objective?.patch)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
    expect(codes(objective?.delete)).toEqual(expect.arrayContaining(["200", "403", "404", "409"]))

    // U2b: activities.
    const activities = paths["/api/v1/projects/{id}/activities"]
    expect(codes(activities?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(activities?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    const activity = paths["/api/v1/projects/{id}/activities/{activityId}"]
    expect(codes(activity?.patch)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
    expect(codes(activity?.delete)).toEqual(expect.arrayContaining(["200", "403", "404", "409"]))

    // U3: deliverables and indicators.
    for (const segment of ["deliverables", "indicators"]) {
      const collection = paths[`/api/v1/projects/{id}/${segment}`]
      expect(codes(collection?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
      expect(codes(collection?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    }
    const deliverable = paths["/api/v1/projects/{id}/deliverables/{deliverableId}"]
    expect(codes(deliverable?.patch)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
    expect(codes(deliverable?.delete)).toEqual(expect.arrayContaining(["200", "403", "404", "409"]))
    const indicator = paths["/api/v1/projects/{id}/indicators/{indicatorId}"]
    expect(codes(indicator?.patch)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
    expect(codes(indicator?.delete)).toEqual(expect.arrayContaining(["200", "403", "404"]))
  })

  it("registers the S4 avances paths with their access and state codes", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})
    const progress = paths["/api/v1/projects/{id}/deliverables/{deliverableId}/progress"]
    expect(codes(progress?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(progress?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    const anular = paths["/api/v1/projects/{id}/deliverables/{deliverableId}/progress/{progressId}/void"]
    expect(codes(anular?.post)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
  })

  it("registers the S4 medios paths (sign, confirm/link, list, download)", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})
    const base = "/api/v1/projects/{id}/progress/{progressId}/attachments"
    expect(codes(paths[base]?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(paths[base]?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    expect(codes(paths[`${base}/sign`]?.post)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409", "413"]))
    expect(codes(paths[`${base}/{attachmentId}/download`]?.get)).toEqual(expect.arrayContaining(["200", "403", "404"]))
  })
  it("registers the S4 measurements and beneficiaries paths and the delete 409s", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})
    const med = "/api/v1/projects/{id}/indicators/{indicatorId}/measurements"
    expect(codes(paths[med]?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(paths[med]?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    expect(codes(paths[`${med}/{measurementId}/void`]?.post)).toEqual(
      expect.arrayContaining(["200", "400", "403", "404", "409"]),
    )
    const ben = "/api/v1/projects/{id}/beneficiaries"
    expect(codes(paths[ben]?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(paths[ben]?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    expect(codes(paths[`${ben}/{beneficiaryId}/void`]?.post)).toEqual(
      expect.arrayContaining(["200", "400", "403", "404", "409"]),
    )
    expect(codes(paths["/api/v1/projects/{id}/indicators/{indicatorId}"]?.delete)).toContain("409")
    expect(codes(paths["/api/v1/projects/{id}/activities/{activityId}"]?.delete)).toContain("409")
  })
  it("registers the S4 technical-status path with its corte parameter", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const op = paths["/api/v1/projects/{id}/technical-status"]?.get
    expect(Object.keys(op?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409"]))
    const params = (op?.parameters ?? []) as { name: string; in: string }[]
    expect(params.map((p) => [p.name, p.in])).toEqual(expect.arrayContaining([["corte", "query"]]))
    // S14 P6: the enriched payload documents the v6 columns and the objective roll-up.
    const schema = JSON.stringify(op?.responses?.["200"])
    for (const campo of ["programado", "dias", "al_corte", "sin_soporte", "objetivo_codigo", "objetivos"]) {
      expect(schema, campo).toContain(campo)
    }
  })
  it("registers the S5 budget and programming operations", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})
    const budget = paths["/api/v1/projects/{id}/budget"]
    expect(codes(budget?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(budget?.put)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
    const programming = paths["/api/v1/projects/{id}/programming"]
    expect(codes(programming?.get)).toEqual(expect.arrayContaining(["200", "403", "404", "409"]))
    expect(codes(programming?.put)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
  })
  it("registers the S5 financial-sheet path with corte and base parameters", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const op = paths["/api/v1/projects/{id}/financial-sheet"]?.get
    expect(Object.keys(op?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409"]))
    const params = (op?.parameters ?? []) as { name: string; in: string }[]
    expect(params.map((p) => [p.name, p.in])).toEqual(
      expect.arrayContaining([
        ["corte", "query"],
        ["base", "query"],
      ]),
    )
  })
  it("registers the S6 expense operations", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})
    const list = paths["/api/v1/projects/{id}/expenses"]
    expect(codes(list?.get)).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    expect(codes(list?.post)).toEqual(expect.arrayContaining(["201", "400", "403", "404", "409"]))
    expect(codes(paths["/api/v1/projects/{id}/expenses/sign"]?.post)).toEqual(
      expect.arrayContaining(["200", "400", "403", "404", "409", "413"]),
    )
    const one = paths["/api/v1/projects/{id}/expenses/{expenseId}"]
    expect(codes(one?.get)).toEqual(expect.arrayContaining(["200", "403", "404"]))
    expect(codes(one?.patch)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
  })
  it("registers the S6 validation workflow and the queue", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})
    for (const action of ["validate", "reject", "void"]) {
      const op = paths[`/api/v1/projects/{id}/expenses/{expenseId}/${action}`]?.post
      expect(codes(op)).toEqual(expect.arrayContaining(["200", "401", "403", "404", "409"]))
    }
    expect(codes(paths["/api/v1/projects/{id}/expenses/{expenseId}/reject"]?.post)).toContain("400")
    expect(codes(paths["/api/v1/expense-validations"]?.get)).toEqual(
      expect.arrayContaining(["200", "400", "401", "403"]),
    )
    expect(
      codes(paths["/api/v1/projects/{id}/expenses/{expenseId}/attachments/{attachmentId}/download"]?.get),
    ).toEqual(expect.arrayContaining(["200", "401", "403", "404", "500"]))
  })
  it("registers the S7 template download and import operations", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const codes = (op: { responses?: object } | undefined) => Object.keys(op?.responses ?? {})

    const template = paths["/api/v1/projects/{id}/template"]?.get
    expect(codes(template)).toEqual(expect.arrayContaining(["200", "401", "403", "404", "409", "500"]))
    const content = (template?.responses?.["200"] as { content?: Record<string, unknown> } | undefined)?.content
    expect(Object.keys(content ?? {})).toEqual([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ])

    const importar = paths["/api/v1/projects/{id}/import"]?.post
    expect(codes(importar)).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409", "413", "500"]))
    const body = importar?.requestBody as { content?: Record<string, unknown> } | undefined
    expect(Object.keys(body?.content ?? {})).toEqual(["multipart/form-data"])
    const reporte = (importar?.responses?.["400"] as { content?: Record<string, { schema?: unknown }> } | undefined)
      ?.content?.["application/json"]?.schema
    expect(JSON.stringify(reporte)).toContain("reporte")
  })
  it("registers the S8 baseline approval operation", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const op = paths["/api/v1/projects/{id}/baseline/approve"]?.post
    expect(Object.keys(op?.responses ?? {})).toEqual(expect.arrayContaining(["201", "401", "403", "404", "409", "500"]))
    const conflict = (op?.responses?.["409"] as { content?: Record<string, { schema?: unknown }> } | undefined)?.content?.[
      "application/json"
    ]?.schema
    expect(JSON.stringify(conflict)).toContain("precondiciones")
  })
  it("registers the S8 modification request operations", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const ruta = paths["/api/v1/projects/{id}/modifications"]
    expect(Object.keys(ruta?.post?.responses ?? {})).toEqual(expect.arrayContaining(["201", "400", "401", "403", "404", "409", "500"]))
    expect(Object.keys(ruta?.get?.responses ?? {})).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    const invalida = (ruta?.post?.responses?.["400"] as { content?: Record<string, { schema?: unknown }> } | undefined)?.content?.[
      "application/json"
    ]?.schema
    expect(JSON.stringify(invalida)).toContain("reglas")
  })
  it("registers the S8 modification decision operations", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const aprobar = paths["/api/v1/projects/{id}/modifications/{modificationId}/approve"]?.post
    expect(Object.keys(aprobar?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409", "500"]))
    const rechazar = paths["/api/v1/projects/{id}/modifications/{modificationId}/reject"]?.post
    expect(Object.keys(rechazar?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
  })
  it("registers the S8 version reads and the base parameter of the two ficha endpoints", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    for (const ruta of ["versions", "versions/{numero}", "versions/compare"]) {
      expect(Object.keys(paths[`/api/v1/projects/{id}/${ruta}`]?.get?.responses ?? {}), ruta).toEqual(expect.arrayContaining(["200", "401", "403", "404"]))
    }
    for (const ruta of ["financial-sheet", "technical-status"]) {
      const parametros = JSON.stringify(paths[`/api/v1/projects/{id}/${ruta}`]?.get?.parameters)
      expect(parametros, ruta).toContain("original")
    }
  })
  it("registers the S9 KPI paths: portfolio dashboard and per-project KPIs", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const portfolio = paths["/api/v1/dashboard/portfolio"]?.get
    expect(Object.keys(portfolio?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "500"]))
    const names = ((portfolio?.parameters ?? []) as { name: string }[]).map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(["corte", "linea_id", "cliente_id", "responsable_id", "estado", "municipio_id"]))
    expect(JSON.stringify(portfolio)).not.toContain("por_territorio")
    const one = paths["/api/v1/projects/{id}/kpis"]?.get
    expect(Object.keys(one?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409"]))
    expect(JSON.stringify(one?.parameters)).toContain("original")
  })
  it("registers the S14 por_linea aggregate on the portfolio dashboard", () => {
    const schema = JSON.stringify(buildOpenApiDocument().components?.schemas)
    expect(schema).toContain("por_linea")
    expect(schema).toContain("por_color_tecnico")
  })
  it("registers the S14 attention path with its corte parameter", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const one = paths["/api/v1/projects/{id}/attention"]?.get
    expect(Object.keys(one?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409"]))
    const names = ((one?.parameters ?? []) as { name: string }[]).map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(["corte"]))
    expect(JSON.stringify(buildOpenApiDocument().components?.schemas)).toContain("gasto_observado")
  })
  it("registers the S14 S-curve path with its base parameter and two curves", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const one = paths["/api/v1/projects/{id}/curve"]?.get
    expect(Object.keys(one?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409"]))
    const names = ((one?.parameters ?? []) as { name: string }[]).map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(["base"]))
    // The row shape lives in the registered components; the 200 is a $ref to it.
    const schema = JSON.stringify(buildOpenApiDocument().components?.schemas)
    for (const campo of ["CurvaPunto", "periodo", "tecnico", "financiero", "planeado", "ejecutado"]) {
      expect(schema, campo).toContain(campo)
    }
  })
  it("registers the S9 export paths: xlsx binary, PDF refused with 400", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const one = paths["/api/v1/projects/{id}/export"]?.get
    expect(Object.keys(one?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "409"]))
    const names = ((one?.parameters ?? []) as { name: string }[]).map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(["formato", "ficha", "corte", "base"]))
    expect(JSON.stringify(one?.responses?.["200"])).toContain("spreadsheetml.sheet")
    const all = paths["/api/v1/dashboard/portfolio/export"]?.get
    expect(Object.keys(all?.responses ?? {})).toEqual(expect.arrayContaining(["200", "400", "401", "403"]))
    expect(JSON.stringify(all?.responses?.["200"])).toContain("spreadsheetml.sheet")
  })
  it("registers the C3a interactions feed and the extended bitácora schema", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const feed = paths["/api/v1/interactions"]?.get
    expect(feed).toBeDefined()
    expect(Object.keys(feed?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "400", "401"]),
    )
    const names = ((feed?.parameters ?? []) as { name: string }[]).map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(["cliente_id", "tipo"]))

    // The extended log entry: tipo + proximo_paso live on the shared component.
    const schema = JSON.stringify(buildOpenApiDocument().components?.schemas)
    expect(schema).toContain("TipoInteraccion")
    expect(schema).toContain("proximo_paso")
  })
  it("registers the C4a global contacts feed and the extended Contacto schema", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    const feed = paths["/api/v1/contacts"]?.get
    expect(feed).toBeDefined()
    expect(Object.keys(feed?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "400", "401"]),
    )
    const names = ((feed?.parameters ?? []) as { name: string }[]).map((p) => p.name)
    expect(names).toEqual(
      expect.arrayContaining(["cliente_id", "con_quadrante", "poder", "interes"]),
    )

    // The extended Contacto component: quadrant + owner fields, plus the feed's
    // cliente/owner display names.
    const schema = JSON.stringify(buildOpenApiDocument().components?.schemas)
    for (const campo of ["poder", "interes", "fuerza_relacion", "owner_id", "owner_nombre"]) {
      expect(schema, campo).toContain(campo)
    }
  })
})
