import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PAGE_HEADERS } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Reportes",
};

export default function ReportesPage() {
  const page = PAGE_HEADERS["/reportes"];
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-[17px_17px_17px_6px] border border-rose-200 bg-rose-50 text-rose-500">
          <FileText className="size-5" strokeWidth={1.7} />
        </span>
        <span className="mt-4 inline-flex h-[24px] items-center rounded-full bg-ink-100 px-3 text-[11px] font-bold text-ink-700">
          Hito 6
        </span>
        <h2 className="mt-3 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
          {page.title}
        </h2>
        <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-600">
          {page.subtitle}
</p>
      </div>
    </div>
  );
}