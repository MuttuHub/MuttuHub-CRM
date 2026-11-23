import { z } from "zod";

/**
 * Tags of clients and projects, from the admin catalogue `task_tags`. Same rules as the tasks API
 * (POST/PATCH /tasks): trim, non-empty, <= 50 chars, <= 20 tags, plus dedupe keeping the first
 * occurrence's order. Shared by the clients and projects endpoints.
 */
export const ETIQUETAS_SCHEMA = z
  .array(z.string().trim().min(1, "Hay una etiqueta vacía.").max(50, "Etiqueta muy larga."))
  .max(20, "Demasiadas etiquetas (máximo 20).")
  .transform((tags) => [...new Set(tags)]);
