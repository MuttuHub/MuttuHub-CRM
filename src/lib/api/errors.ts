// API error envelope helpers (PRD §8.2).
// Every error response is `{ "error": "string", "code": "string" }`.

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INACTIVE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FILE_TOO_LARGE"
  | "INTERNAL_ERROR";

export function apiError(
  error: string,
  status: number,
  code: ApiErrorCode,
): NextResponse {
  return NextResponse.json({ error, code }, { status });
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

/** Password policy (PRD §3.1): min 8 chars, letters and numbers. */
export function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
  );
}

/** Basic email shape check (server-side). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
