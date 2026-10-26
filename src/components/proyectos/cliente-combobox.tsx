"use client";

// One field to search and select the client (PO feedback 2026-10-23): typing filters
// the list by name and choosing an option selects it. Replaces the separate search
// input + select pair of the project form.

import { Combobox } from "@base-ui/react/combobox";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClienteOpcion = { id: string; nombre: string };

type ClienteComboboxProps = {
  id: string;
  clientes: ClienteOpcion[];
  /** Selected client id; `""` when none. */
  value: string;
  onChange: (id: string) => void;
};

export function ClienteCombobox({ id, clientes, value, onChange }: ClienteComboboxProps) {
  const seleccionado = clientes.find((c) => c.id === value) ?? null;
  return (
    <Combobox.Root
      items={clientes}
      value={seleccionado}
      onValueChange={(cliente) => onChange(cliente?.id ?? "")}
      itemToStringLabel={(cliente) => cliente.nombre}
      isItemEqualToValue={(a, b) => a.id === b.id}
    >
      <div className="relative">
        <Combobox.Input
          id={id}
          aria-label="Cliente"
          placeholder="Busca o selecciona el cliente"
          className="h-11 w-full rounded-12 border border-border-strong bg-input-bg py-2 pr-9 pl-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <Combobox.Trigger
          aria-label="Ver clientes"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
        >
          <ChevronDownIcon className="pointer-events-none size-4" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-[min(20rem,var(--available-height))] w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10">
            <Combobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:p-0">
              Ningún cliente coincide.
            </Combobox.Empty>
            <Combobox.List>
              {(cliente: ClienteOpcion) => (
                <Combobox.Item
                  key={cliente.id}
                  value={cliente}
                  className={cn(
                    "flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-hidden select-none",
                    "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium",
                  )}
                >
                  {cliente.nombre}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
