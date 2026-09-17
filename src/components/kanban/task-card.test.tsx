// PR 4 (Slice B2): UI gate on the kanban card's drag affordance.
//
// `useSortable({ disabled })` blocks BOTH pointer and keyboard reordering in
// @dnd-kit (the existing "BUG FIX" comment on the previous call site notes
// exactly this). We expose a `data-dnd-disabled` attribute on the wrapper so
// the gate is observable from jsdom without depending on dnd-kit's internal
// state — the contract the spec cares about is "is this card off as a drag
// source right now?", and the attribute is the cheapest stable signal.

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SortableTaskCard, TaskCard, type CardTask } from "./task-card"

const BASE_TASK: CardTask = {
  id: "t1",
  titulo: "Revisar contrato marco",
  estado: "EN_CURSO",
  prioridad: "ALTA",
  etiquetas: ["legal"],
  cliente_nombre: "Cliente Demo",
  responsable_nombre: "Gerencia Demo",
  fecha_entrega: null,
  motivo_bloqueo: null,
  subtotal: 0,
  puede_editar: false,
}

function renderCard(puede_editar: boolean) {
  return render(
    <ul>
      <SortableTaskCard
        task={{ ...BASE_TASK, puede_editar }}
        onClick={() => undefined}
      />
    </ul>,
  )
}

// The dnd-kit `useSortable` wrapper exposes itself with role="button" +
// aria-roledescription="sortable". The card body inside is also a button
// (clickable to open the dialog). We want the wrapper's data-dnd-disabled,
// not the inner card.
function wrapperOf(titulo: string): HTMLElement {
  const titleEl = screen.getByText(titulo)
  // The wrapper is the closest button ancestor with aria-roledescription.
  let el: HTMLElement | null = titleEl as HTMLElement
  while (el) {
    if (el.getAttribute("aria-roledescription") === "sortable") return el
    el = el.parentElement
  }
  throw new Error("Could not find the dnd-kit wrapper for the card")
}

describe("SortableTaskCard — PR 4 UI gate", () => {
  it("marks the wrapper as not draggable when puede_editar is false (data-dnd-disabled=true)", () => {
    renderCard(false)
    const wrapper = wrapperOf(BASE_TASK.titulo)
    expect(wrapper.getAttribute("data-dnd-disabled")).toBe("true")
  })

  it("marks the wrapper as draggable when puede_editar is true (data-dnd-disabled=false)", () => {
    renderCard(true)
    const wrapper = wrapperOf(BASE_TASK.titulo)
    expect(wrapper.getAttribute("data-dnd-disabled")).toBe("false")
  })

  it("still renders the card itself (read-only — the task IS visible to the COLABORADOR)", () => {
    renderCard(false)
    expect(screen.getByText(BASE_TASK.titulo)).toBeInTheDocument()
  })
})

// RNF-C01 / opportunity-task-linking spec: the Kanban MUST visually
// distinguish a task linked to a PROSPECCION opportunity from one linked to
// an EJECUCION opportunity (or with no opportunity at all).
describe("TaskCard — opportunity phase chip (RNF-C01)", () => {
  it("renders the amber 'Prospección' chip when oportunidad_fase is PROSPECCION", () => {
    render(
      <TaskCard
        task={{ ...BASE_TASK, oportunidad_id: "op-1", oportunidad_nombre: "Oportunidad X", oportunidad_fase: "PROSPECCION" }}
        onClick={() => undefined}
      />,
    )
    expect(screen.getByText("Prospección")).toBeInTheDocument()
  })

  it("renders the emerald 'Ejecución' chip when oportunidad_fase is EJECUCION", () => {
    render(
      <TaskCard
        task={{ ...BASE_TASK, oportunidad_id: "op-1", oportunidad_nombre: "Oportunidad X", oportunidad_fase: "EJECUCION" }}
        onClick={() => undefined}
      />,
    )
    expect(screen.getByText("Ejecución")).toBeInTheDocument()
  })

  it("renders neither chip when oportunidad_fase is null (no linked opportunity)", () => {
    render(
      <TaskCard
        task={{ ...BASE_TASK, oportunidad_id: null, oportunidad_nombre: null, oportunidad_fase: null }}
        onClick={() => undefined}
      />,
    )
    expect(screen.queryByText("Prospección")).not.toBeInTheDocument()
    expect(screen.queryByText("Ejecución")).not.toBeInTheDocument()
  })
})
