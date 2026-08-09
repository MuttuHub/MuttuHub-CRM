import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportesPage } from "@/components/reportes/reportes-page";

export const metadata: Metadata = {
  title: "Reportes",
};

export default function ReportesRoutePage() {
  return (
    <Suspense>
      <ReportesPage />
    </Suspense>
  );
}