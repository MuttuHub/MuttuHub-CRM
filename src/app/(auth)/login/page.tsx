"use client";

// Login page — approved access design (Downloads/muttu-hub-acceso.html).
// Full-screen two-pane layout; all flows live in AccesoPage.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccesoPage } from "@/components/auth/acceso-page";

// GoTrue's own error redirect (invalid/expired invite or recovery token)
// does not honor our custom `redirectTo=/auth/confirm` — it falls back to
// the project's bare Site URL with the failure appended as a hash
// (`#error=access_denied&error_code=otp_expired&...`). The proxy then sees
// an unauthenticated request to that root path and bounces it here, and the
// browser carries the hash along across that server redirect. `/auth/confirm`
// already renders the right "Enlace no válido" + reenviar card for a hash it
// doesn't recognize as a valid token — so instead of duplicating that logic,
// forward there and let it handle it.
function hasSupabaseAuthHash(hash: string): boolean {
  return /(^|[#&])(access_token|error|error_code)=/.test(hash);
}

function LoginRoute() {
  const searchParams = useSearchParams();
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (hasSupabaseAuthHash(window.location.hash)) {
      setForwarding(true);
      window.location.replace(`/auth/confirm${window.location.hash}`);
    }
  }, []);

  const next = searchParams.get("next") ?? "/";
  const expired = searchParams.get("expired") === "1";
  const solicitud = searchParams.get("solicitud") === "1";
  const errorOauth = searchParams.get("error") === "1";
  const errorInactivo = searchParams.get("error") === "inactive";

  if (forwarding) {
    return <div style={{ minHeight: "100vh", background: "#EFEAEB" }} />;
  }

  return (
    <AccesoPage
      next={next}
      expired={expired}
      solicitud={solicitud}
      errorOauth={errorOauth}
      errorInactivo={errorInactivo}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#EFEAEB" }} />}>
      <LoginRoute />
    </Suspense>
  );
}