import * as React from "react"

import { cn } from "@/lib/utils"

type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Optional bold headline above the description. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Optional leading icon, rendered above the copy. */
  icon?: React.ReactNode
  /** Optional call to action, rendered below the copy. */
  action?: React.ReactNode
  /** Dashed, tinted container (inline empty blocks inside cards/sheets). */
  bordered?: boolean
}

/** Shared "nothing here yet" block (v6 gap map: single EmptyState primitive). */
function EmptyState({
  title,
  description,
  icon,
  action,
  bordered = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        bordered &&
          "min-h-[140px] rounded-14 border border-dashed border-ink-300 bg-ink-100/40",
        className
      )}
      {...props}
    >
      {icon}
      {title ? (
        <p
          data-slot="empty-state-title"
          className="text-sm font-semibold text-ink-800"
        >
          {title}
        </p>
      ) : null}
      {description ? (
        <p
          data-slot="empty-state-description"
          className="max-w-[36ch] text-[13px] leading-relaxed text-ink-600"
        >
          {description}
        </p>
      ) : null}
      {action}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
