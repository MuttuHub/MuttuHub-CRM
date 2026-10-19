import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { ProyectosVista } from "@/components/proyectos/proyectos-vista";

export const metadata: Metadata = {
  title: "Proyectos",
};

export const dynamic = "force-dynamic";

export default function ProyectosPage() {
  return (
    <Suspense fallback={<ProyectosSkeleton />}>
      <ProyectosVista />
    </Suspense>
  );
}

function ProyectosSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="h-9 w-72" />
      <div className="rounded-[22px] border border-ink-200 bg-panel p-5">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
