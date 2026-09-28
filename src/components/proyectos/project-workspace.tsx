// gestion-proyectos-workspace, Phase 4 (design.md T1 — workspace shell +
// `?tab=` sync, spec.md "Workspace por proyecto con tabs" + "Link a
// oportunidad condicional"). Mirrors the `?cliente=` deep-link convention of
// `client-list.tsx`/`notification-panel.tsx` (`router.replace`, `scroll:
// false`) instead of a `[tab]` route segment (design T1's own rejection).
//
// Phases 5-7: Resumen, Cronograma, Gantt and Indicadores are wired, none of
// them disabled. `TabsContent` (Base UI's `Tabs.Panel`) only mounts the
// active tab's content, so switching tabs never fetches or renders the
// others eagerly.
//
// proyecto-financiero-tab (F1.1): adds the fifth tab, Financiero, same
// mount-only-when-selected behavior, reusing `useBudget`/`GET .../budget`
// (already gated server-side by `canViewProject`, no new permission here).
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
import { MetasTab } from "@/components/proyectos/tabs/metas-tab";
import { CronogramaTab } from "@/components/proyectos/tabs/cronograma-tab";
import { GanttTab } from "@/components/proyectos/tabs/gantt-tab";
import { IndicadoresTab } from "@/components/proyectos/tabs/indicadores-tab";
import { FinancieroTab } from "@/components/proyectos/tabs/financiero-tab";
import { LegalizacionTab } from "@/components/proyectos/tabs/legalizacion-tab";
import { SoportesTab } from "@/components/proyectos/tabs/soportes-tab";

// F1.4 (D6, corrected): "metas" is the 2nd tab, right after "resumen" —
// matching v6's visual order — not appended at the end like F1.1-F1.3 were.
const TAB_VALUES = [
  "resumen",
  "metas",
  "cronograma",
  "gantt",
  "indicadores",
  "financiero",
  "legalizacion",
  "soportes",
] as const;
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
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="financiero">Financiero</TabsTrigger>
          <TabsTrigger value="legalizacion">Legalización</TabsTrigger>
          <TabsTrigger value="soportes">Soportes</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <ResumenTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="metas" className="mt-4">
          <MetasTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="cronograma" className="mt-4">
          <CronogramaTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="gantt" className="mt-4">
          <GanttTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="indicadores" className="mt-4">
          <IndicadoresTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="financiero" className="mt-4">
          <FinancieroTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="legalizacion" className="mt-4">
          <LegalizacionTab projectId={proyecto.id} />
        </TabsContent>
        <TabsContent value="soportes" className="mt-4">
          <SoportesTab projectId={proyecto.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
