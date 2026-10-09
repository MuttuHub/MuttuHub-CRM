// Formulario "Solicitar modificación" (S8 U6, E-26). Ofrece solo los campos que el tipo permite y
// envía lo que cambió, con el valor que la persona vio como `antes`. NO valida reglas: RF-28 y
// REQ-GAS-06 las decide la API y llegan en línea (todas a la vez). El botón lo ven quienes gestionan
// proyectos y el COORDINADOR integrante (A-01); es comodidad, la autoridad es la API.

"use client";

import { useState, type ReactNode } from "react";
import { FilePen, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError, errorMessage } from "@/components/proyectos/estructura-ui";
import {
  ModificacionReglasError,
  useProjectActivities,
  useProjectBudget,
  useProjectDeliverables,
  useProjectIndicators,
  useProjectProgramming,
  useRequestModification,
  type ModificacionRegla,
  type ProjectListRow,
} from "@/hooks/projects";
import { construirDetalle, type CampoEditable, type TipoModificacion } from "@/lib/proyectos/modificacion-detalle";
import { formatCOP, toCents } from "@/lib/proyectos/money";

export const TIPO_MODIFICACION_LABEL: Record<TipoModificacion, string> = {
  TRASLADO: "Traslado entre rubros",
  ADICION: "Adición de recursos",
  REDUCCION: "Reducción de recursos",
  REPROGRAMACION: "Reprogramación de periodos",
  CRONOGRAMA: "Cronograma",
  ENTREGABLES: "Entregables e indicadores",
};

const TIPOS = Object.keys(TIPO_MODIFICACION_LABEL) as TipoModificacion[];
const SELECT_CLASS = "h-9 rounded-12 border border-ink-200 bg-panel px-3 text-[13px] text-ink-900";
const CELDA_CLASS = "h-8 w-[8.5rem] rounded-12 bg-panel px-2 text-right text-[12.5px] tabular-nums";

export function SolicitarModificacion({ proyecto }: { proyecto: ProjectListRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FilePen />
        Solicitar modificación
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(860px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Solicitar modificación
            </DialogTitle>
            <DialogDescription>
              Cambia solo lo necesario y explica el motivo. Gerencia la revisa y, si la aprueba, se crea una nueva
              versión del proyecto.
            </DialogDescription>
          </DialogHeader>
          {open && <Formulario proyecto={proyecto} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Formulario({ proyecto, onDone }: { proyecto: ProjectListRow; onDone: () => void }) {
  const budget = useProjectBudget(proyecto.id);
  const programming = useProjectProgramming(proyecto.id);
  const activities = useProjectActivities(proyecto.id);
  const deliverables = useProjectDeliverables(proyecto.id);
  const indicators = useProjectIndicators(proyecto.id);
  const solicitar = useRequestModification(proyecto.id);

  const [tipo, setTipo] = useState<TipoModificacion>("TRASLADO");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reglas, setReglas] = useState<ModificacionRegla[]>([]);

  const consultas = [budget, programming, activities, deliverables, indicators];
  const cargando = consultas.some((q) => q.isLoading);
  const fallo = consultas.find((q) => q.isError);

  // Every input of the current tipo, keyed so what is typed survives re-renders but not a tipo change.
  const clave = (...partes: string[]) => partes.join("|");
  const campos: CampoEditable[] = [];
  const grilla = tipo === "TRASLADO" || tipo === "ADICION" || tipo === "REDUCCION" || tipo === "REPROGRAMACION";
  const rubros = (budget.data?.rubros ?? []).filter((r) => r.codigo !== null && (r.activo || toCents(r.asignado) > BigInt(0)));
  const periodos = programming.data?.periodos ?? [];
  const celdaActual = (rubroId: string, periodo: string) =>
    programming.data?.filas.find((f) => f.rubro_id === rubroId && f.periodo === periodo)?.valor ?? "0.00";

  if (grilla) {
    for (const rubro of rubros) {
      const codigo = rubro.codigo as string;
      campos.push({ elemento: "presupuesto", clave: codigo, campo: "asignado", antes: rubro.asignado, valor: valores[clave("a", codigo)] ?? "" });
      for (const periodo of periodos) {
        campos.push({
          elemento: "programacion",
          clave: `${codigo}|${periodo}`,
          campo: "valor",
          antes: celdaActual(rubro.rubro_id, periodo),
          valor: valores[clave("p", codigo, periodo)] ?? "",
        });
      }
    }
  } else if (tipo === "CRONOGRAMA") {
    campos.push(
      { elemento: "proyecto", clave: "proyecto", campo: "fecha_inicio", antes: proyecto.fecha_inicio ?? "", valor: valores.fecha_inicio ?? "" },
      { elemento: "proyecto", clave: "proyecto", campo: "fecha_fin", antes: proyecto.fecha_fin ?? "", valor: valores.fecha_fin ?? "" },
    );
    for (const a of activities.data ?? []) {
      campos.push(
        { elemento: "actividad", clave: a.codigo, campo: "semana_inicio", antes: String(a.semana_inicio), valor: valores[clave("si", a.codigo)] ?? "" },
        { elemento: "actividad", clave: a.codigo, campo: "semana_fin", antes: String(a.semana_fin), valor: valores[clave("sf", a.codigo)] ?? "" },
      );
    }
  } else {
    for (const e of deliverables.data ?? []) {
      campos.push({ elemento: "entregable", clave: e.codigo, campo: "cantidad_meta", antes: e.cantidad_meta, valor: valores[clave("e", e.codigo)] ?? "" });
    }
    for (const i of indicators.data ?? []) {
      campos.push({ elemento: "indicador", clave: i.codigo, campo: "meta", antes: i.meta, valor: valores[clave("i", i.codigo)] ?? "" });
    }
  }
  const detalle = construirDetalle(tipo, campos);

  const valorDe = (llave: string, antes: string) => valores[llave] ?? antes;
  const escribir = (llave: string) => (valor: string) => setValores((previo) => ({ ...previo, [llave]: valor }));

  function cambiarTipo(siguiente: TipoModificacion) {
    setTipo(siguiente);
    setValores({});
    setError(null);
    setReglas([]);
  }

  async function enviar() {
    setError(null);
    setReglas([]);
    try {
      await solicitar.mutateAsync({ tipo, motivo: motivo.trim(), detalle });
      onDone();
    } catch (err) {
      if (err instanceof ModificacionReglasError) {
        setReglas(err.reglas);
      } else {
        setError(errorMessage(err, "No pudimos registrar la solicitud. Inténtalo de nuevo."));
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px] text-ink-600">
        Tipo de modificación
        <select
          aria-label="Tipo de modificación"
          value={tipo}
          onChange={(event) => cambiarTipo(event.target.value as TipoModificacion)}
          className={SELECT_CLASS}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {TIPO_MODIFICACION_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      {fallo ? (
        <InlineError message={errorMessage(fallo.error, "No pudimos cargar los datos del proyecto. Inténtalo de nuevo.")} />
      ) : cargando ? (
        <Skeleton className="h-32 w-full rounded-[14px]" />
      ) : grilla ? (
        <div data-testid="modificacion-grilla" className="overflow-x-auto rounded-[14px] border border-ink-200 bg-panel">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[11px] text-ink-500">
                <th scope="col" className="px-3 py-2 font-semibold">Rubro</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Asignado</th>
                {periodos.map((periodo) => (
                  <th key={periodo} scope="col" className="px-2 py-2 text-right font-semibold">{periodo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rubros.map((rubro) => {
                const codigo = rubro.codigo as string;
                return (
                  <tr key={rubro.rubro_id} className="border-b border-ink-100 last:border-b-0">
                    <td className="px-3 py-1.5 text-ink-800">
                      <span className="font-mono text-[11.5px] text-ink-500">{codigo} </span>
                      {rubro.nombre}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {tipo === "REPROGRAMACION" ? (
                        <span className="tabular-nums">{formatCOP(toCents(rubro.asignado))}</span>
                      ) : (
                        <Input
                          aria-label={`Asignado ${codigo}`}
                          inputMode="decimal"
                          value={valorDe(clave("a", codigo), rubro.asignado)}
                          onChange={(event) => escribir(clave("a", codigo))(event.target.value)}
                          className={CELDA_CLASS}
                        />
                      )}
                    </td>
                    {periodos.map((periodo) => (
                      <td key={periodo} className="px-2 py-1.5 text-right">
                        <Input
                          aria-label={`Programado ${codigo} ${periodo}`}
                          inputMode="decimal"
                          value={valorDe(clave("p", codigo, periodo), celdaActual(rubro.rubro_id, periodo))}
                          onChange={(event) => escribir(clave("p", codigo, periodo))(event.target.value)}
                          className={CELDA_CLASS}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : tipo === "CRONOGRAMA" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Fecha de inicio">
              <Input
                type="date"
                aria-label="Fecha de inicio"
                value={valorDe("fecha_inicio", proyecto.fecha_inicio ?? "")}
                onChange={(event) => escribir("fecha_inicio")(event.target.value)}
                className="h-9 rounded-12 bg-panel px-3"
              />
            </Campo>
            <Campo label="Fecha de fin">
              <Input
                type="date"
                aria-label="Fecha de fin"
                value={valorDe("fecha_fin", proyecto.fecha_fin ?? "")}
                onChange={(event) => escribir("fecha_fin")(event.target.value)}
                className="h-9 rounded-12 bg-panel px-3"
              />
            </Campo>
          </div>
          <ul className="flex flex-col gap-2">
            {(activities.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-ink-200 bg-panel p-2.5">
                <span className="min-w-0 flex-1 text-[12.5px] text-ink-800">
                  <span className="font-mono text-[11.5px] text-ink-500">{a.codigo} </span>
                  {a.nombre}
                </span>
                <Input
                  aria-label={`Semana inicial ${a.codigo}`}
                  inputMode="numeric"
                  value={valorDe(clave("si", a.codigo), String(a.semana_inicio))}
                  onChange={(event) => escribir(clave("si", a.codigo))(event.target.value)}
                  className="h-8 w-16 rounded-12 bg-panel px-2 text-right"
                />
                <Input
                  aria-label={`Semana final ${a.codigo}`}
                  inputMode="numeric"
                  value={valorDe(clave("sf", a.codigo), String(a.semana_fin))}
                  onChange={(event) => escribir(clave("sf", a.codigo))(event.target.value)}
                  className="h-8 w-16 rounded-12 bg-panel px-2 text-right"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(deliverables.data ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-ink-200 bg-panel p-2.5">
              <span className="min-w-0 flex-1 text-[12.5px] text-ink-800">
                <span className="font-mono text-[11.5px] text-ink-500">{e.codigo} </span>
                {e.descripcion}
              </span>
              <Input
                aria-label={`Cantidad ${e.codigo}`}
                inputMode="decimal"
                value={valorDe(clave("e", e.codigo), e.cantidad_meta)}
                onChange={(event) => escribir(clave("e", e.codigo))(event.target.value)}
                className="h-8 w-24 rounded-12 bg-panel px-2 text-right"
              />
            </li>
          ))}
          {(indicators.data ?? []).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-ink-200 bg-panel p-2.5">
              <span className="min-w-0 flex-1 text-[12.5px] text-ink-800">
                <span className="font-mono text-[11.5px] text-ink-500">{i.codigo} </span>
                {i.nombre}
              </span>
              <Input
                aria-label={`Meta ${i.codigo}`}
                inputMode="decimal"
                value={valorDe(clave("i", i.codigo), i.meta)}
                onChange={(event) => escribir(clave("i", i.codigo))(event.target.value)}
                className="h-8 w-24 rounded-12 bg-panel px-2 text-right"
              />
            </li>
          ))}
        </ul>
      )}

      <Campo label="Motivo">
        <textarea
          aria-label="Motivo"
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          rows={3}
          maxLength={1000}
          className="rounded-12 border border-ink-200 bg-panel px-3 py-2 text-[13px] text-ink-900"
        />
      </Campo>

      <InlineError message={error} />
      {reglas.length > 0 && (
        <ul data-testid="modificacion-reglas" role="alert" className="list-disc pl-5 text-[13px] text-destructivo">
          {reglas.map((regla, indice) => (
            <li key={`${regla.codigo}-${indice}`}>{regla.mensaje}</li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <Button
          type="button"
          disabled={solicitar.isPending || cargando || motivo.trim() === "" || detalle.length === 0}
          onClick={() => void enviar()}
        >
          {solicitar.isPending && <LoaderCircle className="animate-spin" />}
          Enviar solicitud
        </Button>
      </DialogFooter>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-600">
      {label}
      {children}
    </div>
  );
}
