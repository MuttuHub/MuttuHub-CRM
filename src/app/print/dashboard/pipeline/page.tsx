import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintDashboardCara } from "@/components/dashboard/print-dashboard";

export const metadata: Metadata = {
  title: "Reporte — Pipeline comercial",
};

export const dynamic = "force-dynamic";

export default function PrintDashboardPipelinePage() {
  return (
    <Suspense>
      <PrintDashboardCara cara="pipeline" />
    </Suspense>
  );
}