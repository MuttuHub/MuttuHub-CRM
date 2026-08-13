// /api-docs — interactive OpenAPI reference for the internal API (PRD §8.2).
// Admin-only: it's the complete shape of every endpoint, including the ones
// with elevated permissions (users, settings, solicitudes-acceso).
// Standalone route (no (app) shell/sidebar) so Swagger UI gets the full
// viewport — it manages its own layout and doesn't need the app chrome.

import type { Metadata } from "next";
import { requireRole } from "@/lib/supabase/server";
import { ApiDocsViewer } from "@/components/api-docs/api-docs-viewer";

export const metadata: Metadata = {
  title: "API Docs",
};

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  const auth = await requireRole(["ADMINISTRADOR"], "/?notice=admin_only");

  // Unconfigured dev mode (auth === null): stay visible, same convention as
  // every other admin page in the app.
  void auth;

  return <ApiDocsViewer />;
}
