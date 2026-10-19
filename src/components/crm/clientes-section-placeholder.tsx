// v7 alignment, unit C1a: honest placeholder for a Clientes section whose screen
// and backend are not built yet (units C2..C7). It names the section and says it
// is coming, so the new sub-navigation is truthful instead of a dead end. Each
// section replaces its placeholder as its unit lands.

import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function ClientesSectionPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="surface flex min-h-[280px] items-center justify-center p-6 sm:p-8">
      <EmptyState
        icon={
          <span className="grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
            <Hammer className="size-6" strokeWidth={1.7} />
          </span>
        }
        title={`${title} · en construcción`}
        description={description}
      />
    </section>
  );
}
