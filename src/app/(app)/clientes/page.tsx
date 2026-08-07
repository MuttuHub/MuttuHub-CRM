import type { Metadata } from "next";
import { CLIENTES, iniciales, type Tone } from "@/lib/mock/demo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Aliados y clientes",
};

const TONE_BADGE: Record<Tone, string> = {
  neutro: "bg-ink-100 text-ink-700",
  activo: "bg-rose-50 text-rose-700",
  alerta: "bg-alerta-bg text-alerta",
  riesgo: "bg-destructivo-bg text-destructivo",
  exito: "bg-exito-bg text-exito",
  info: "bg-info-bg text-info",
};

export default function ClientesPage() {
  return (
    <div className="min-w-0">
      <section className="rounded-[22px] border border-ink-200 bg-white p-5 lg:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Cartera activa
          </h2>
          <span className="inline-flex h-[24px] items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700">
            <span className="size-1.5 rounded-full bg-rose-500" />
            Datos demostración
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <caption className="sr-only">
              Aliados y clientes de demostración
            </caption>
            <thead>
              <tr className="text-left">
                <th className="px-3 pb-2 text-[10.5px] font-bold tracking-[0.09em] text-ink-600 uppercase">
                  Aliado
                </th>
                <th className="px-3 pb-2 text-[10.5px] font-bold tracking-[0.09em] text-ink-600 uppercase">
                  Tipo
                </th>
                <th className="px-3 pb-2 text-[10.5px] font-bold tracking-[0.09em] text-ink-600 uppercase">
                  Estado
                </th>
                <th className="px-3 pb-2 text-right text-[10.5px] font-bold tracking-[0.09em] text-ink-600 uppercase">
                  Valor COP
                </th>
                <th className="px-3 pb-2 text-right text-[10.5px] font-bold tracking-[0.09em] text-ink-600 uppercase">
                  Compromiso
                </th>
              </tr>
            </thead>
            <tbody>
              {CLIENTES.map((c, i) => (
                <tr key={c.id} className="group">
                  <td
                    className={cn(
                      "px-3 py-2.5",
                      i !== 0 ? "border-t border-ink-100" : "",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-ink-100 text-[10.5px] font-bold text-ink-700">
                        {iniciales(c.nombre)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink-950">
                          {c.nombre}
                        </span>
                        <span className="block text-[12px] text-ink-600">
                          {c.ubicacion}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5",
                      i !== 0 ? "border-t border-ink-100" : "",
                    )}
                  >
                    <span className="inline-flex h-[23px] items-center rounded-full border border-ink-200 bg-white px-2.5 text-[11px] font-semibold whitespace-nowrap text-ink-700">
                      {c.tipo}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5",
                      i !== 0 ? "border-t border-ink-100" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-[23px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
                        TONE_BADGE[c.tono],
                      )}
                    >
                      {c.estado}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-mono font-medium tabular-nums text-ink-900",
                      i !== 0 ? "border-t border-ink-100" : "",
                    )}
                  >
                    ${c.valor}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right",
                      i !== 0 ? "border-t border-ink-100" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[12px] font-medium tabular-nums",
                        c.urgente
                          ? "font-bold text-destructivo"
                          : "text-ink-600",
                      )}
                    >
                      {c.compromiso}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}