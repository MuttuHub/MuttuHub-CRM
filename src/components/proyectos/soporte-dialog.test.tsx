// proyecto-soportes-tab, Phase 2 (design.md "Component Structure" —
// `soporte-dialog.tsx`, spec.md "Agregar soporte desde el workspace" —
// RF-04). Mirrors `expense-dialog.tsx`'s conventions: a `formKey`-driven
// reset-on-open effect, inline `role="alert"` validation, `noValidate` on
// the form.
//
// D1 (design.md): Archivo/Enlace is a real XOR radio, not the mock's
// decorative "Formato" select.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actividad, Gasto, Soporte, UploadAttachmentInput } from "@/hooks/projects";
import { SoporteDialog } from "./soporte-dialog";

const { uploadMutateAsync } = vi.hoisted(() => ({
  uploadMutateAsync: vi.fn(async (_input: UploadAttachmentInput) => ({ soporte: {} as Soporte })),
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useUploadAttachment: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
  };
});

function makeActividad(overrides: Partial<Actividad> = {}): Actividad {
  return {
    id: "act-1",
    proyecto_id: "proy-1",
    meta_id: "meta-1",
    nombre: "Taller comunitario",
    descripcion: null,
    peso: 1,
    fecha_planificada: "2026-01-01",
    fecha_real: null,
    porcentaje_avance: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeGasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: "gasto-1",
    proyecto_id: "proy-1",
    linea_id: "linea-1",
    concepto: "Nómina 1.ª quincena",
    monto_cop: "1000000",
    fecha_gasto: "2026-02-13T00:00:00.000Z",
    registrado_por_id: "u-1",
    created_at: "",
    updated_at: "",
    tercero: null,
    numero_comprobante: null,
    observado: false,
    observacion: null,
    estado_legalizacion: "falta_soporte",
    linea: { rubro_id: "rubro-1", rubro: { nombre: "Personal científico" } },
    ...overrides,
  };
}

const actividades = [makeActividad()];
const gastos = [makeGasto()];

beforeEach(() => {
  uploadMutateAsync.mockClear();
});

function renderDialog(overrides: Partial<Parameters<typeof SoporteDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(
    <SoporteDialog
      projectId="proy-1"
      actividades={actividades}
      gastos={gastos}
      open
      onOpenChange={onOpenChange}
      {...overrides}
    />,
  );
  return { onOpenChange };
}

describe("SoporteDialog", () => {
  it("requires Documento before submitting", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/documento es obligatorio/i);
    expect(uploadMutateAsync).not.toHaveBeenCalled();
  });

  it("offers actividades in 'Vincular a' when Tipo is Verificación (default)", () => {
    renderDialog();
    const select = screen.getByLabelText("Vincular a") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Soporte general del proyecto", "Taller comunitario"]);
  });

  it("switches 'Vincular a' options to gastos when Tipo changes to Legalización", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByLabelText("Tipo"), "LEGALIZACION");

    const select = screen.getByLabelText("Vincular a") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      "Soporte general del proyecto",
      "Nómina 1.ª quincena · Personal científico",
    ]);
  });

  it("toggles between the file input and the url input via the Archivo/Enlace radio", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByLabelText(/^archivo$/i)).toBeChecked();
    expect(screen.queryByLabelText(/enlace \(https/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/^enlace$/i));

    expect(screen.getByLabelText(/enlace \(https/i)).toBeInTheDocument();
  });

  it("submits with url set and file absent when Enlace is selected with a valid https link", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^documento/i), "Cuenta de cobro");
    await user.click(screen.getByLabelText(/^enlace$/i));
    await user.type(screen.getByLabelText(/enlace \(https/i), "https://drive.google.com/x");
    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    expect(uploadMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Cuenta de cobro",
        tipo: "VERIFICACION",
        url: "https://drive.google.com/x",
      }),
    );
    const call = uploadMutateAsync.mock.calls[0][0];
    expect(call.file).toBeUndefined();
  });

  it("rejects a non-https enlace client-side without calling the mutation", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^documento/i), "Cuenta de cobro");
    await user.click(screen.getByLabelText(/^enlace$/i));
    await user.type(screen.getByLabelText(/enlace \(https/i), "http://inseguro.com/x");
    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/https:\/\//i);
    expect(uploadMutateAsync).not.toHaveBeenCalled();
  });

  it("submits with file set and url absent when Archivo is selected with a chosen file", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^documento/i), "Listado de asistencia");
    const file = new File(["contenido"], "listado.pdf", { type: "application/pdf" });
    const fileInput = screen.getByLabelText(/^archivo \(pdf/i) as HTMLInputElement;
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    expect(uploadMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Listado de asistencia",
        tipo: "VERIFICACION",
        file,
      }),
    );
    const call = uploadMutateAsync.mock.calls[0][0];
    expect(call.url).toBeUndefined();
  });

  it("includes actividad_id only when a non-general Vincular a option is selected", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^documento/i), "Listado de asistencia");
    await user.selectOptions(screen.getByLabelText("Vincular a"), "act-1");
    await user.click(screen.getByLabelText(/^enlace$/i));
    await user.type(screen.getByLabelText(/enlace \(https/i), "https://drive.google.com/x");
    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    const call = uploadMutateAsync.mock.calls[0][0];
    expect(call.actividad_id).toBe("act-1");
    expect(call.gasto_id).toBeUndefined();
  });

  it("omits both actividad_id and gasto_id when 'Soporte general del proyecto' stays selected", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/^documento/i), "Listado de asistencia");
    await user.click(screen.getByLabelText(/^enlace$/i));
    await user.type(screen.getByLabelText(/enlace \(https/i), "https://drive.google.com/x");
    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    const call = uploadMutateAsync.mock.calls[0][0];
    expect(call.actividad_id).toBeUndefined();
    expect(call.gasto_id).toBeUndefined();
  });

  it("closes the dialog after a successful submit", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText(/^documento/i), "Listado de asistencia");
    await user.click(screen.getByLabelText(/^enlace$/i));
    await user.type(screen.getByLabelText(/enlace \(https/i), "https://drive.google.com/x");
    await user.click(screen.getByRole("button", { name: "Guardar soporte" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
