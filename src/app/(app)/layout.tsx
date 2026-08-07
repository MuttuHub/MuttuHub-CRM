import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { SessionBanner } from "@/components/shell/session-banner";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: the proxy guards routes, this layout re-validates the
  // JWT and redirects to /login when the session is gone.
  await requireUser();

  return (
    <div className="flex min-h-screen gap-[14px] bg-page p-[14px]">
      <div className="flex w-full min-w-0 flex-col gap-[14px]">
        <SessionBanner />
        <div className="flex min-h-0 flex-1 gap-[14px]">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[26px] bg-panel p-6 lg:p-7">
            <Header />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
