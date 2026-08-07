"use client";

// Session expiry banner (PRD §3.1): the app session lasts 4h with no renewal.
// Reads the deadline stored at login (sessionDeadlineAt) and:
// - at 3h50m renders the NON-dismissible amber warning; there is no way to
//   extend the session;
// - at 4h signs out (Supabase, client side) and redirects to /login?expired=1
//   which shows "Tu sesión expiró".
// The Supabase dashboard JWT expiry must be set to 4h (14400s) so JWT and
// banner deadlines stay in sync (see README).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { SESSION, SESSION_STORAGE_KEY } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const CHECK_INTERVAL_MS = 30_000;

export function SessionBanner() {
  const router = useRouter();
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return;

    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const deadlineMs = Number(raw);
    if (!Number.isFinite(deadlineMs)) return;

    const warnAt = deadlineMs - SESSION.warnBeforeMs;

    function tick() {
      const now = Date.now();
      setWarn(now >= warnAt && now < deadlineMs);

      if (now >= deadlineMs) {
        // 4h reached: hard sign-out + redirect with "Tu sesión expiró".
        createClient()
          .auth.signOut()
          .finally(() => {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            router.push("/login?expired=1");
            router.refresh();
          });
      }
    }

    tick();
    const interval = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  if (!warn) return null;

  return (
    <div
      role="alert"
      className="sticky top-[14px] z-40 flex items-center justify-center gap-2.5 rounded-[18px] border border-alerta/30 bg-alerta-bg px-4 py-3 text-[13px] font-semibold text-alerta shadow-sm"
    >
      <AlertTriangle className="size-4 shrink-0" strokeWidth={1.9} />
      Tu sesión se cerrará en 10 minutos. Guarda tu trabajo.
    </div>
  );
}