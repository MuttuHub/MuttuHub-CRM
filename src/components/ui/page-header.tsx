import * as React from "react"

import { cn } from "@/lib/utils"
import { Eyebrow } from "./typography"

// v6 "Page header" (gap map §2/§3 P-level primitive): eyebrow + display
// title + optional subtitle + an actions slot, replacing the per-page ad hoc
// title sizing (project-list.tsx, project-workspace.tsx, dashboard-page.tsx…
// — migrating each screen onto this is V2.x, out of scope here).

interface PageHeaderProps
  extends Omit<React.ComponentProps<"header">, "title"> {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            data-slot="page-header-title"
            className="font-display text-[clamp(1.875rem,4vw,2.75rem)] leading-none font-extrabold tracking-[-0.03em] text-foreground"
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              data-slot="page-header-subtitle"
              className="text-sm text-muted-foreground"
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-slot="page-header-actions"
            className="flex items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  )
}

export { PageHeader }
