// Service-role Supabase client for Storage/admin operations (adjuntos de
// tareas, documentos). Server-only: importing this module in a client
// component leaks the SUPABASE_SERVICE_ROLE_KEY — never do it.
// The storage calls are always wrapped in try/catch by the call sites and
// degraded to typed errors (never a crash).

import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}