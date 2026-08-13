// GET /api/openapi — serves the generated OpenAPI 3.1 document as JSON.
// Public read-only route (the spec itself has no sensitive data — it's the
// same information the route.ts header comments already expose to anyone
// reading the source); the actual endpoints it describes still enforce
// their own auth. Consumed by the Swagger UI page at /api-docs.

import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi/document";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
