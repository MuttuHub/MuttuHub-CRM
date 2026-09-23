// gestion-proyectos-workspace, Phase 4 (design.md T1 — workspace shell +
// `?tab=` sync, spec.md "Workspace por proyecto con tabs" + "Link a
// oportunidad condicional"). Mirrors the `?cliente=` deep-link convention of
// `client-list.tsx`/`notification-panel.tsx` (`router.replace`, `scroll:
// false`) instead of a `[tab]` route segment (design T1's own rejection).
//
// Only the Resumen tab is wired this PR (design's incremental-tab-rollout
// guidance): Cronograma/Gantt/Indicadores render as disabled triggers with a
// "Próximamente" placeholder panel, owned by Phases 5-7.
//
// Access gating: `useProjectDetail` already 403s via `canViewProject`
// (`loadProjectScoped`, unchanged by this PR) — this component only reacts
// to that error, it does not re-derive visibility client-side.

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/http";
import { useProjectDetail } from "@/hooks/projects";
import { ESTADO_PROYECTO_LABELS } from "@/components/proyectos/project-list";
import { ResumenTab } from "@/components/proyectos/tabs/resumen-tab";

const TAB_VALUES = ["resumen", "cronograma", "gantt", "indicadores"] as const;
type TabValue = (typeof TAB_VALUES)[number];
const DEFAULT_TAB: TabValue = "resumen";

function isTabValue(value: string | null): value is TabValue {
  return value !== null && (TAB_VALUES as readonly string[]).includes(value);
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = isTabValue(searchParams.get("tab")) ? (searchParams.get("tab") as TabValue) : DEFAULT_TAB;

  const query = useProjectDetail(projectId);

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (query.isLoading) {
    return <div className="flex h-[400px] items-center justify-center">Cargando proyecto…</div>;
  }

  if (query.isError) {
    const isForbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <div className="flex h-[400px] items-center justify-center text-destructivo">
        {isForbidden ? "No tienes permisos para ver este proyecto." : "No pudimos cargar el proyecto."}
      </div>
    );
  }

  const proyecto = query.data;
  if (!proyecto) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[24px] font-bold text-ink-950">{proyecto.nombre}</h1>
          <Badge variant="secondary">{ESTADO_PROYECTO_LABELS[proyecto.estado]}</Badge>
        </div>
        <p className="text-[13px] text-ink-600">
          {proyecto.codigo} · {proyecto.cliente_nombre}
          {proyecto.oportunidad_id && (
            <>
              {" · "}
              {/* No dedicated `/oportunidades/[id]` deep link exists yet — the
                  oportunidad lives inside the client sheet (same convention
                  as notification-panel.tsx's `/clientes?cliente=` link). */}
              <Link
                href={`/clientes?cliente=${proyecto.cliente_id}`}
                className="underline hover:text-ink-900"
              >
                Ver oportunidad de origen
              </Link>
            </>
          )}
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (typeof value === "string") handleTabChange(value);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="cronograma" disabled>
            Cronograma
          </TabsTrigger>
          <TabsTrigger value="gantt" disabled>
            Gantt
          </TabsTrigger>
          <TabsTrigger value="indicadores" disabled>
            Indicadores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <ResumenTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="cronograma" className="mt-4">
          <p className="text-[13px] text-ink-600">Próximamente.</p>
        </TabsContent>
        <TabsContent value="gantt" className="mt-4">
          <p className="text-[13px] text-ink-600">Próximamente.</p>
        </TabsContent>
        <TabsContent value="indicadores" className="mt-4">
          <p className="text-[13px] text-ink-600">Próximamente.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
