import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/http";
import { shouldRetryProjectQuery } from "./projects";

// D1: the ficha used react-query's default retries, so a 403/404 spent three
// attempts (~11 s) before the "no access" message could render. A 4xx is a
// decision, never a transient failure.
describe("shouldRetryProjectQuery (D1)", () => {
  it.each([400, 401, 403, 404, 409, 422])("never retries a %i", (status) => {
    expect(shouldRetryProjectQuery(0, new ApiError("x", status))).toBe(false);
    expect(shouldRetryProjectQuery(1, new ApiError("x", status))).toBe(false);
  });

  it("retries a 5xx up to three attempts", () => {
    const boom = new ApiError("boom", 500);
    expect(shouldRetryProjectQuery(0, boom)).toBe(true);
    expect(shouldRetryProjectQuery(2, boom)).toBe(true);
    expect(shouldRetryProjectQuery(3, boom)).toBe(false);
  });

  it("retries a network failure, which is not an ApiError", () => {
    expect(shouldRetryProjectQuery(0, new TypeError("fetch failed"))).toBe(true);
    expect(shouldRetryProjectQuery(3, new TypeError("fetch failed"))).toBe(false);
  });
});
