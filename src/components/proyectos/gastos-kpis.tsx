// Resumen del libro de Gastos: una sola línea con los conteos que calcula el servidor (`totales` por estado y
// `resumen`); el cliente no recalcula nada. D5: "observado" no es un estado, es un REGISTRADO con alerta de
// sobregasto o con datos incompletos. Los segmentos en cero se ocultan salvo el total, y "con soporte" solo
// aparece si el servidor lo envía (sin acceso a soportes, RNF-03, no existe).

import { plural } from "@/components/proyectos/estructura-ui";
import type { ProjectExpenses } from "@/hooks/projects";

export const GASTOS_ERROR = "No pudimos cargar los gastos. Inténtalo de nuevo.";

export function GastosResumen({ data }: { data: ProjectExpenses }) {
  const validados = data.totales?.VALIDADO?.cantidad ?? 0;
  const porValidar = data.totales?.REGISTRADO?.cantidad ?? 0;
  const vigentes = data.resumen?.vigentes ?? validados + porValidar;
  const observados = data.resumen?.observados?.cantidad ?? 0;
  const conSoporte = data.resumen?.con_soporte;

  const segmentos = [
    plural(vigentes, "gasto", "gastos"),
    validados > 0 && plural(validados, "validado", "validados"),
    porValidar > 0 && `${porValidar} por validar`,
    observados > 0 && plural(observados, "pendiente por revisión", "pendientes por revisión"),
    conSoporte !== undefined && conSoporte > 0 && `${conSoporte} con soporte`,
  ].filter(Boolean);

  return (
    <p data-testid="gastos-resumen" className="mt-2 text-[13px] text-ink-600 tabular-nums">
      {segmentos.join(" · ")}
    </p>
  );
}
