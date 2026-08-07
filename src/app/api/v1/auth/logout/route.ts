// POST /api/v1/auth/logout — ends the Supabase session (204). Idempotent:
// an anonymous request still gets 204 so the client can always clear state.

import { NextResponse } from "next/server";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function POST() {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  return new NextResponse(null, { status: 204 });
}