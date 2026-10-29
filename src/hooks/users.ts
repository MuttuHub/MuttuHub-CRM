// Mutation hooks for the two privileged, link-returning admin actions on a
// user (resend invite / reset password). The users table itself still reads
// its list from a Server Component and calls router.refresh() after a
// mutation (see src/components/admin/users-table.tsx), so this file only
// covers the actions that are new enough to deserve their own hook with
// error-toast handling, instead of another raw fetch() in that component.

"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api/http";

export function useResendInvite(): UseMutationResult<{ inviteUrl: string }, unknown, string> {
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ inviteUrl: string }>(`/api/v1/users/${id}/resend-invite`),
    onError: (err) => toastError(err, "No pudimos generar el enlace de invitación."),
  });
}

export function useResetUserPassword(): UseMutationResult<{ resetUrl: string }, unknown, string> {
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ resetUrl: string }>(`/api/v1/users/${id}/reset-password`),
    onError: (err) => toastError(err, "No pudimos generar el enlace de restablecimiento."),
  });
}

function toastError(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}
