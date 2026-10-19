import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { shouldRetryQuery } from "./retry";

// D1: a request answered with a 4xx is a decision, never a transient failure.
// react-query's default retries turned the ficha's 403/404 into ~11 s of
// skeleton before the "no access" message could render.
describe("shouldRetryQuery (D1)", () => {
  it.each([400, 401, 403, 404, 409, 422])("never retries a %i", (status) => {
    expect(shouldRetryQuery(0, new ApiError("x", status))).toBe(false);
    expect(shouldRetryQuery(1, new ApiError("x", status))).toBe(false);
  });

  it("retries a 5xx up to three attempts", () => {
    const boom = new ApiError("boom", 500);
    expect(shouldRetryQuery(0, boom)).toBe(true);
    expect(shouldRetryQuery(2, boom)).toBe(true);
    expect(shouldRetryQuery(3, boom)).toBe(false);
  });

  it("retries a network failure, which is not an ApiError", () => {
    expect(shouldRetryQuery(0, new TypeError("fetch failed"))).toBe(true);
    expect(shouldRetryQuery(3, new TypeError("fetch failed"))).toBe(false);
  });
});
