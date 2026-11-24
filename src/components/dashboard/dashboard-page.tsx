// Dashboard (Hito 6, PRD §7): contenedor con las 4 "caras" del dashboard,
// barra de filtros comunes sticky (§7.2: presets de rango + «Personalizado», solo del dashboard)
// y el botón "Generar reporte" que abre el PDF imprimible por cara con los
// filtros aplicados, en la misma pestaña (S4). El estado de filtros vive aquí (useState) y se pasa a
// cada cara; el remount por tab hace que las queries (key = filtros)
// refetcheen solas.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flag,
  Gauge,
  ListChecks,
  Printer,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  buildDashboardQuery,
  rangoMesActual,
  type DashboardFilters,
} from "@/hooks/dashboard";
import { useUsers } from "@/hooks/crm";
import { ENUM_VALUES, TIPO_CLIENTE_LABELS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import {
  RANGO_OPCIONES,
  useFiltersStore,
  type RangoFiltro,
} from "@/store/filters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChipSelector } from "@/components/dashboard/shared";
import { CaraPipeline } from "@/components/dashboard/cara-pipeline";
import { CaraTareas } from "@/components/dashboard/cara-tasks";
import { CaraClientesActividad } from "@/components/dashboard/cara-clients-activity";
import { CaraMiResumen } from "@/components/dashboard/cara-my-summary";

const CARAS = [
  { id: "pipeline", label: "Pipeline comercial", icon: Gauge },
  { id: "tasks", label: "Gestión de tareas", icon: ListChecks },
  { id: "clients-activity", label: "Actividad de clientes", icon: UsersRound },
  { id: "my-summary", label: "Mi resumen", icon: UserRound },
] as const;

type CaraId = (typeof CARAS)[number]["id"];

function fechaDesde(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Pendientes #27: «Personalizado» lives only in the dashboard. The shared store (header and Reportes) keeps its
 * presets, so a custom range never reaches places that have nowhere to show its dates.
 */
const PERSONALIZADO = "personalizado" as const;
type RangoDashboard = RangoFiltro | typeof PERSONALIZADO;
const OPCIONES_DASHBOARD: { value: RangoDashboard; label: string }[] = [
  ...RANGO_OPCIONES,
  { value: PERSONALIZADO, label: "Personalizado" },
];
const RANGO_INVALIDO_MENSAJE = "La fecha inicial debe ser anterior o igual a la final.";

export function DashboardTabs({ notice }: { notice?: string }) {
  const router = useRouter();
  const [cara, setCara] = useState<CaraId>("pipeline");
  const rango = useFiltersStore((s) => s.rango);
  const setRango = useFiltersStore((s) => s.setRango);
  // Null while a preset applies; the custom dates start as the current month.
  const [personalizado, setPersonalizado] = useState<{ desde: string; hasta: string } | null>(null);
  const [responsable, setResponsable] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const [dias, setDias] = useState(14);

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];

  // ISO dates compare as strings; an empty field leaves that side open.
  const rangoInvalido =
    personalizado !== null &&
    personalizado.desde !== "" &&
    personalizado.hasta !== "" &&
    personalizado.desde > personalizado.hasta;

  const filters: DashboardFilters = useMemo(() => {
    const filtrosComunes = {
      responsable_id: responsable || undefined,
      tipo_cliente: tipoCliente || undefined,
    };
    if (personalizado) {
      return {
        desde: personalizado.desde || undefined,
        hasta: personalizado.hasta || undefined,
        ...filtrosComunes,
      };
    }
    const mes = rango === "mes" ? rangoMesActual() : null;
    const desde =
      rango === "todo" ? undefined : rango === "mes" ? mes!.desde : fechaDesde(Number(rango));
    return {
      desde,
      hasta: mes ? mes.hasta : undefined,
      ...filtrosComunes,
    };
  }, [personalizado, rango, responsable, tipoCliente]);

  function elegirRango(valor: RangoDashboard) {
    if (valor === PERSONALIZADO) {
      setPersonalizado((actual) => actual ?? rangoMesActual());
      return;
    }
    setPersonalizado(null);
    setRango(valor);
  }

  // Misma pestaña (S4): la vista de impresión trae «Volver», que regresa aquí.
  function generarReporte() {
    if (rangoInvalido) return;
    const qs = buildDashboardQuery(filters, { dias_sin_gestion: dias });
    router.push(`/print/dashboard/${cara}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {notice === "admin_only" && (
        <div className="flex items-center gap-2.5 rounded-inner border border-alerta/30 bg-alerta-bg px-4 py-3 text-[13px] font-medium text-alerta">
          <Flag className="size-4 shrink-0" strokeWidth={1.9} />
          Solo los administradores pueden acceder a Usuarios y permisos.
        </div>
      )}

      {/* Tabs: las 4 caras */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-ink-100 p-1">
        {CARAS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCara(c.id)}
            aria-pressed={cara === c.id}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[12.5px] font-bold whitespace-nowrap transition-colors",
              cara === c.id
                ? "bg-card text-ink-950 shadow-sm"
                : "text-ink-600 hover:text-ink-900",
            )}
          >
            <c.icon className="size-4" strokeWidth={1.9} />
            {c.label}
          </button>
        ))}
      </div>

      {/* Filtros comunes (§7.2) + Generar reporte */}
      <div className="sticky top-2 z-20 rounded-inner border border-border bg-panel/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="flex items-center gap-2">
            <span className="hidden text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase sm:inline">
              Rango
            </span>
            <ChipSelector
              options={OPCIONES_DASHBOARD}
              value={personalizado ? PERSONALIZADO : rango}
              onChange={elegirRango}
            />
          </div>

          {personalizado && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-700">
                Desde
                <Input
                  type="date"
                  className="w-[9.5rem]"
                  value={personalizado.desde}
                  max={personalizado.hasta || undefined}
                  aria-invalid={rangoInvalido || undefined}
                  onChange={(e) => setPersonalizado({ ...personalizado, desde: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-700">
                Hasta
                <Input
                  type="date"
                  className="w-[9.5rem]"
                  value={personalizado.hasta}
                  min={personalizado.desde || undefined}
                  aria-invalid={rangoInvalido || undefined}
                  onChange={(e) => setPersonalizado({ ...personalizado, hasta: e.target.value })}
                />
              </label>
              {rangoInvalido && (
                <p role="alert" className="text-[12px] font-medium text-alerta">
                  {RANGO_INVALIDO_MENSAJE}
                </p>
              )}
            </div>
          )}

          <Select value={responsable} onValueChange={(v) => v !== null && setResponsable(v)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Todos los responsables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los responsables</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tipoCliente} onValueChange={(v) => v !== null && setTipoCliente(v)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los tipos de cliente</SelectItem>
              {ENUM_VALUES.TipoCliente.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_CLIENTE_LABELS[t as keyof typeof TIPO_CLIENTE_LABELS]?.label ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto">
            <Button
              size="sm"
              onClick={generarReporte}
              disabled={rangoInvalido}
              className="px-4 font-bold"
            >
              <Printer className="size-4" strokeWidth={1.9} />
              Generar reporte
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">
          Este mes usa el mes calendario en curso · el reporte PDF respeta
          los filtros y el alcance de tu rol.
        </p>
      </div>

      {/* Cara activa */}
      {cara === "pipeline" && <CaraPipeline filters={filters} />}
      {cara === "tasks" && <CaraTareas filters={filters} />}
      {cara === "clients-activity" && (
        <CaraClientesActividad filters={filters} dias={dias} onDias={setDias} />
      )}
      {cara === "my-summary" && <CaraMiResumen filters={filters} />}
    </div>
  );
}