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
})
