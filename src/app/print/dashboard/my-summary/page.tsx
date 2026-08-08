import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintDashboardCara } from "@/components/dashboard/print-dashboard";

export const metadata: Metadata = {
  title: "Reporte — Mi resumen",
};

export const dynamic = "force-dynamic";

export default function PrintDashboardMySummaryPage() {
  return (
    <Suspense>
      <PrintDashboardCara cara="my-summary" />
    </Suspense>
  );
}