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
    expect(codes(deliverable?.delete)).toEqual(expect.arrayContaining(["200", "403", "404"]))
    const indicator = paths["/api/v1/projects/{id}/indicators/{indicatorId}"]
    expect(codes(indicator?.patch)).toEqual(expect.arrayContaining(["200", "400", "403", "404", "409"]))
    expect(codes(indicator?.delete)).toEqual(expect.arrayContaining(["200", "403", "404"]))
  })
})
