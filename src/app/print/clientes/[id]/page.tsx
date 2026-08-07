import { Suspense } from "react";
import type { Metadata } from "next";
import { PrintFicha } from "@/components/crm/print-ficha";

export const metadata: Metadata = {
  title: "Ficha de cliente",
};

export const dynamic = "force-dynamic";

export default async function PrintFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <PrintFicha clientId={id} />
    </Suspense>
  );
}