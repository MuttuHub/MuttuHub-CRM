"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

/** Renders the live-generated spec from GET /api/openapi — always in sync
 * with the actual route.ts files, never a stale checked-in file. */
export function ApiDocsViewer() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI url="/api/openapi" docExpansion="list" defaultModelsExpandDepth={2} />
    </div>
  );
}
