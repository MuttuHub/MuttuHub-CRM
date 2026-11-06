"use client";

// File picker in Spanish. A bare <input type="file"> shows the browser's own «Choose File · No file
// chosen», whatever the app's language; this keeps that real input (visually hidden, still focusable
// and labelled by the caller's <Label htmlFor>) and draws the button and the file name itself.

import { useState, type Ref } from "react";
import { Paperclip } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SelectorArchivo({
  id,
  onChange,
  accept,
  disabled = false,
  inputRef,
}: {
  id: string;
  onChange: (archivo: File | null) => void;
  accept?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [nombre, setNombre] = useState<string | null>(null);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => {
          const archivo = event.target.files?.[0] ?? null;
          setNombre(archivo?.name ?? null);
          onChange(archivo);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Paperclip strokeWidth={1.8} aria-hidden="true" />
        Elegir archivo
      </label>
      <span className="min-w-0 truncate text-[12.5px] text-ink-600">{nombre ?? "Ningún archivo elegido"}</span>
    </div>
  );
}
