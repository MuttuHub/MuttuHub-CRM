import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen gap-[14px] bg-page p-[14px]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[26px] bg-panel p-6 lg:p-7">
        <Header />
        {children}
      </main>
    </div>
  );
}