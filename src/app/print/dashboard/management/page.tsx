import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintDashboardCara } from "@/components/dashboard/print-dashboard";

export const metadata: Metadata = {
  title: "Reporte — Tablero gerencial",
};

export const dynamic = "force-dynamic";

export default function PrintDashboardManagementPage() {
  return (
    <Suspense>
      <PrintDashboardCara cara="management" />
    </Suspense>
  );
}
