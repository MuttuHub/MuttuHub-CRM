// API error envelope helpers (PRD §8.2).
// Every error response is `{ "error": "string", "code": "string" }`.

import { NextResponse } from "next/server";
import { isValidPassword } from "@/lib/auth/password-policy";

export { isValidPassword };

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INACTIVE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "FILE_TOO_LARGE"
  | "OVERSPEND_BLOCKED"
  | "INTERNAL_ERROR";

/**
 * `extra` carries additional keys next to the envelope (the S7 import report is
 * `{ reporte }`). `error` and `code` always win: extra keys never overwrite them.
 */
export function apiError(
  error: string,
  status: number,
  code: ApiErrorCode,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ...extra, error, code }, { status });
}

/** Reads and parses a JSON body; returns null when the body is not JSON. */
export async function parseJsonBody<T>(
  request: Request,
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Basic email shape check (server-side). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
