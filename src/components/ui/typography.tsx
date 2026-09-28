import * as React from "react"

import { cn } from "@/lib/utils"

// v6 type utilities (gap map §1 "Design tokens"): small presentational
// building blocks so screens stop hand-setting ad hoc sizes. Each merges an
// optional className via `cn` and forwards the rest of its props, matching
// the other `ui/*` primitives (data-slot for targeting/testing).

/** 12/700/uppercase/.1em tracking, text-3 (`--ink-500`) — labels above a title. */
function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="eyebrow"
      className={cn(
        "text-xs font-bold tracking-widest text-ink-500 uppercase",
        className
      )}
      {...props}
    />
  )
}

/** 20-28/700 — section headings inside a screen (e.g. card/tab sections). */
function SectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="section-title"
      className={cn("text-xl font-bold text-foreground", className)}
      {...props}
    />
  )
}

/** 28-32/800 display, tabular-nums — KPI figures (StatTile/KpiTile). */
function KpiNumeral({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kpi-numeral"
      className={cn(
        "font-display text-[28px] leading-none font-extrabold tabular-nums text-foreground",
        className
      )}
      {...props}
    />
  )
}

/** JetBrains Mono, tabular-nums — codes/amounts/timestamps. */
function MonoData({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="mono-data"
      className={cn("font-mono text-[13px] tabular-nums", className)}
      {...props}
    />
  )
}

export { Eyebrow, SectionTitle, KpiNumeral, MonoData }
