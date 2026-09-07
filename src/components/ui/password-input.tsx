"use client"

// Password input with a show/hide toggle (eye). Shares the base Input styling
// and semantics — id/label/autoComplete flow through as in any other input, so
// forms keep their existing labels, autofill hints and validation.

import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

function PasswordInput({ className, ...props }: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute inset-y-0 right-1 grid w-8 place-items-center rounded-r-md text-ink-500 outline-none transition-colors hover:text-ink-900 focus-visible:text-ink-900 focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:text-ink-100 dark:focus-visible:text-ink-100"
      >
        {visible ? (
          <EyeOff className="size-4" strokeWidth={1.8} />
        ) : (
          <Eye className="size-4" strokeWidth={1.8} />
        )}
      </button>
    </div>
  )
}

export { PasswordInput }
