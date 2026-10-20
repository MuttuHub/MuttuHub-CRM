import { describe, expect, it } from "vitest";
import { etiquetasVisibles } from "./etiquetas";

describe("etiquetasVisibles", () => {
  it("hides a tag that repeats the category, ignoring case and spaces", () => {
    expect(etiquetasVisibles(["Otro", "  otro ", "Legal"], "Otro")).toEqual(["Legal"]);
  });

  it("keeps every other tag in order", () => {
    expect(etiquetasVisibles(["Informes", "Legal", "2026"], "Operativo")).toEqual(["Informes", "Legal", "2026"]);
  });

  it("returns an empty list when there are no tags", () => {
    expect(etiquetasVisibles([], "Otro")).toEqual([]);
  });
});
