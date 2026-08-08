// Typed fetch wrapper for the Muttu Hub API (PRD §8.2 envelopes).
// Every non-2xx response throws ApiError { error, code, status }; 204 returns
// undefined. Mutations that return void/undefined are typed with ApiVoid.

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INACTIVE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FILE_TOO_LARGE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "La solicitud no es válida. Revisa los datos e inténtalo de nuevo.",
  401: "Tu sesión no es válida o expiró. Inicia sesión de nuevo.",
  403: "No tienes permisos para realizar esta acción.",
  404: "El recurso no existe o fue eliminado.",
  409: "El recurso ya existe o está en conflicto.",
  500: "Ocurrió un error en el servidor. Inténtalo de nuevo.",
};

async function readErrorBody(res: Response): Promise<{ error?: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    return body ?? {};
  } catch {
    return {};
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      // 2xx without a JSON body and without 204 (e.g. the xlsx export).
      return undefined as T;
    }
  }

  const body = await readErrorBody(res);
  const message = body.error ?? FALLBACK_MESSAGES[res.status] ?? "Ocurrió un error inesperado.";
  throw new ApiError(message, res.status, body.code);
}

export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "DELETE" });
}

/** Mutation result type for endpoints that answer 204. */
export type ApiVoid = undefined;