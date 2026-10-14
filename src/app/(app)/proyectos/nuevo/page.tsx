import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { NuevoProyecto } from "@/components/proyectos/nuevo-proyecto/nuevo-proyecto";

export const metadata: Metadata = {
  title: "Nuevo proyecto",
};

export const dynamic = "force-dynamic";

// The step and the created project live in the query string (`?proyecto=<id>&paso=<n>`, `?oportunidad=<id>`);
// the client component reads them with `useSearchParams`, hence the Suspense boundary.
export default function NuevoProyectoPage() {
  return (
    <Suspense fallback={<NuevoProyectoSkeleton />}>
      <NuevoProyecto />
    </Suspense>
  );
}

function NuevoProyectoSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4">
      <div className="surface space-y-3 p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
