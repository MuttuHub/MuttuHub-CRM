// T5a (S9): the initial allies of a new posición propia project, chosen in the create form in place
// of the client. Each ally is a client with its role, its state and, optionally, its committed
// contribution in COP. A client appears once (the server rejects repeats), so a client already
// added is not offered again. More allies are added, edited and removed later from the ficha.

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ClienteCombobox, type ClienteOpcion } from "@/components/proyectos/cliente-combobox";
import { HelpHint } from "@/components/ui/help-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AllyEstado, AllyRol, ProjectAllyInput } from "@/hooks/projects";

import { ESTADO_ALIADO_LABEL, ROL_ALIADO_LABEL } from "@/components/proyectos/aliados-labels";

/** One ally while it is edited: the aporte stays as typed until the submit. */
export type AliadoInicial = {
  cliente_id: string;
  rol: AllyRol;
  estado: AllyEstado;
  aporte: string;
};

const MENSAJE_APORTE = "El aporte de cada aliado debe ser un número mayor o igual a 0.";

/** Blank = no aporte; otherwise a finite number ≥ 0. */
function aporteValido(aporte: string): boolean {
  const limpio = aporte.trim();
  if (limpio === "") return true;
  const valor = Number(limpio);
  return Number.isFinite(valor) && valor >= 0;
}

export function validarAliados(aliados: AliadoInicial[]): string | null {
  return aliados.every((a) => aporteValido(a.aporte)) ? null : MENSAJE_APORTE;
}

/** The body the server takes (`ALIADO_CREATE_SCHEMA`): a blank aporte is not sent. */
export function aliadosParaEnviar(aliados: AliadoInicial[]): ProjectAllyInput[] {
  return aliados.map(({ cliente_id, rol, estado, aporte }) => {
    const limpio = aporte.trim();
    return limpio === ""
      ? { cliente_id, rol, estado }
      : { cliente_id, rol, estado, aporte_cop: Number(limpio) };
  });
}

export function AliadosIniciales({
  clientes,
  aliados,
  onChange,
}: {
  clientes: ClienteOpcion[];
  aliados: AliadoInicial[];
  onChange: (aliados: AliadoInicial[]) => void;
}) {
  // Remounts the picker after each addition so its search text starts empty again.
  const [pickerKey, setPickerKey] = useState(0);
  const nombres = new Map(clientes.map((c) => [c.id, c.nombre]));
  const elegidos = new Set(aliados.map((a) => a.cliente_id));
  const disponibles = clientes.filter((c) => !elegidos.has(c.id));

  function agregar(clienteId: string) {
    if (clienteId === "" || elegidos.has(clienteId)) return;
    onChange([...aliados, { cliente_id: clienteId, rol: "ALIADO", estado: "EN_GESTION", aporte: "" }]);
    setPickerKey((k) => k + 1);
  }

  function actualizar(clienteId: string, cambio: Partial<AliadoInicial>) {
    onChange(aliados.map((a) => (a.cliente_id === clienteId ? { ...a, ...cambio } : a)));
  }

  function quitar(clienteId: string) {
    onChange(aliados.filter((a) => a.cliente_id !== clienteId));
  }

  return (
    <fieldset aria-labelledby="proyecto-aliados-label" className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <span id="proyecto-aliados-label" className="text-sm leading-none font-medium">
          Aliados
        </span>
        <HelpHint label="Aliados">
          Un proyecto de posición propia no tiene cliente: vincula los clientes que participan como aliados,
          con su rol, su estado y, si ya se conoce, su aporte. Es opcional; también puedes agregarlos después
          desde la ficha.
        </HelpHint>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="proyecto-aliado-nuevo">Agregar aliado</Label>
        <ClienteCombobox
          key={pickerKey}
          id="proyecto-aliado-nuevo"
          clientes={disponibles}
          value=""
          onChange={agregar}
          ariaLabel="Cliente aliado"
        />
      </div>

      {aliados.length === 0 ? (
        <p className="text-[12px] text-ink-500">Aún no hay aliados.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {aliados.map((aliado) => {
            const nombre = nombres.get(aliado.cliente_id) ?? aliado.cliente_id;
            const aporteId = `proyecto-aliado-aporte-${aliado.cliente_id}`;
            return (
              <li
                key={aliado.cliente_id}
                aria-label={`Aliado: ${nombre}`}
                className="surface-inner flex flex-col gap-3 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink-900">{nombre}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${nombre}`}
                    onClick={() => quitar(aliado.cliente_id)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    value={aliado.rol}
                    onValueChange={(value) => value && actualizar(aliado.cliente_id, { rol: value as AllyRol })}
                  >
                    <SelectTrigger aria-label={`Rol de ${nombre}`} className="w-full px-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROL_ALIADO_LABEL) as AllyRol[]).map((rol) => (
                        <SelectItem key={rol} value={rol}>
                          {ROL_ALIADO_LABEL[rol]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={aliado.estado}
                    onValueChange={(value) =>
                      value && actualizar(aliado.cliente_id, { estado: value as AllyEstado })
                    }
                  >
                    <SelectTrigger aria-label={`Estado de ${nombre}`} className="w-full px-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ESTADO_ALIADO_LABEL) as AllyEstado[]).map((estado) => (
                        <SelectItem key={estado} value={estado}>
                          {ESTADO_ALIADO_LABEL[estado]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id={aporteId}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    aria-label={`Aporte de ${nombre}`}
                    placeholder="Aporte en COP (opcional)"
                    value={aliado.aporte}
                    onChange={(event) => actualizar(aliado.cliente_id, { aporte: event.target.value })}
                    className="px-3 font-mono tabular-nums"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
