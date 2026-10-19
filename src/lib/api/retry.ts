// Retry policy shared by every query (D1).
//
// A request answered with a 4xx is a decision: the server already said no, so
// retrying only delays the message the user needs (a 403/404 ficha spent ~11 s
// in the skeleton). Transient failures — 5xx, network errors — keep the three
// attempts react-query uses by default.
import { ApiError } from "./http";

export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
}
