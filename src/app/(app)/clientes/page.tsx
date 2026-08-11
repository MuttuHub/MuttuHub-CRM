import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientList } from "@/components/crm/client-list";

export const metadata: Metadata = {
  title: "Aliados y clientes",
};

export const dynamic = "force-dynamic";

export default function ClientesPage() {
  return (
    <Suspense fallback={<ClientesSkeleton />}>
      <ClientList />
    </Suspense>
  );
}

function ClientesSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="h-9 w-72" />
      <div className="h-[120px] rounded-[22px] border border-ink-200 bg-white p-5">
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="rounded-[22px] border border-ink-200 bg-white p-5">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-12" />
          ))}
        </div>
      </div>
    </div>
  );
}