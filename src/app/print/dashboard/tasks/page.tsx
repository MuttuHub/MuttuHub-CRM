import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintDashboardCara } from "@/components/dashboard/print-dashboard";

export const metadata: Metadata = {
  title: "Reporte — Gestión de tareas",
};

export const dynamic = "force-dynamic";

export default function PrintDashboardTasksPage() {
  return (
    <Suspense>
      <PrintDashboardCara cara="tasks" />
    </Suspense>
  );
}