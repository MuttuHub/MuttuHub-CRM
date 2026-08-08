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
  return <AccesoPage next={next} expired={expired} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#EFEAEB" }} />}>
      <LoginRoute />
    </Suspense>
  );
}