"use client";

// Login page — approved access design (Downloads/muttu-hub-acceso.html).
// Full-screen two-pane layout; all flows live in AccesoPage.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AccesoPage } from "@/components/auth/acceso-page";

function LoginRoute() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const expired = searchParams.get("expired") === "1";
  const solicitud = searchParams.get("solicitud") === "1";
  const errorOauth = searchParams.get("error") === "1";
  const errorInactivo = searchParams.get("error") === "inactive";
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