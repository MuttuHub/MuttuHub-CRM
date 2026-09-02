import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SnippetText } from "./repository-list";

describe("SnippetText (búsqueda FTS — plan 4B)", () => {
  it("wraps «coincidencias» in <mark>", () => {
    render(<SnippetText snippet="…de «contrato marco» vigente…" />);
    const mark = screen.getByText("contrato marco");
    expect(mark.tagName).toBe("MARK");
  });

  it("renders plain text without a mark when there are no delimiters", () => {
    render(<SnippetText snippet="sin coincidencias resaltadas" />);
    expect(screen.getByText("sin coincidencias resaltadas")).toBeInTheDocument();
    expect(document.querySelector("mark")).toBeNull();
  });

  it("never renders HTML from the snippet (no dangerouslySetInnerHTML)", () => {
    render(<SnippetText snippet={"…«<img src=x onerror=alert(1)>»…"} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>").tagName).toBe("MARK");
  });
});