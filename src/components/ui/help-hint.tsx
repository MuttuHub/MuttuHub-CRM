// Small "?" help button that opens a popover with a short explanation. A click-to-open popover (not a hover
// tooltip) so it works on touch and from the keyboard. The accessible name says which field it explains.

"use client"

import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"
import { Popover, PopoverContent, PopoverDescription, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function HelpHint({
  label,
  children,
  className,
}: {
  /** Name of what is being explained ("Valor total"); becomes the button name "Ayuda: Valor total". */
  label: string
  /** The explanation: at most two short sentences. */
  children: ReactNode
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Ayuda: ${label}`}
            className={cn(
              "relative inline-grid size-5 shrink-0 place-items-center rounded-full text-ink-500 transition-colors after:absolute after:-inset-2 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              className,
            )}
          />
        }
      >
        <CircleHelp className="size-4" strokeWidth={1.8} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72 min-w-0 p-3" side="top">
        <PopoverDescription className="text-[13px] leading-relaxed text-ink-700">{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
