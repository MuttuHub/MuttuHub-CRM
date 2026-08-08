import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintDashboardCara } from "@/components/dashboard/print-dashboard";

export const metadata: Metadata = {
  title: "Reporte — Actividad de clientes",
};

export const dynamic = "force-dynamic";

export default function PrintDashboardClientsActivityPage() {
  return (
    <Suspense>
      <PrintDashboardCara cara="clients-activity" />
    </Suspense>
  );
}