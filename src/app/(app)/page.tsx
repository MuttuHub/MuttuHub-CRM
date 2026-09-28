import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardTabs, type CaraId } from "@/components/dashboard/dashboard-page";

export const metadata: Metadata = {
  title: "Inicio",
};

export const dynamic = "force-dynamic";

const CARA_IDS: CaraId[] = ["pipeline", "tasks", "clients-activity", "my-summary", "management"];

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; cara?: string }>;
}) {
  const { notice, cara } = await searchParams;
  // F1.6: `?cara=management` (nav, o el redirect 308 de
  // `/tablero-gerencial`) preselecciona la 5.ª cara; un valor desconocido se
  // ignora (DashboardTabs cae a su default "pipeline").
  const initialCara = CARA_IDS.find((id) => id === cara);

  return (
    <Suspense fallback={<InicioSkeleton />}>
      <DashboardTabs notice={notice} initialCara={initialCara} />
    </Suspense>
  );
}

function InicioSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex h-12 items-center gap-1 rounded-lg bg-ink-100 p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 flex-1 rounded-[9px]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[20px] border border-ink-200 bg-panel p-[18px]">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-[22px] border border-ink-200 bg-panel p-6">
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}