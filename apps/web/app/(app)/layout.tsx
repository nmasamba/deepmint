import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Sidebar />
      <div className="md:pl-60">
        <Topbar />
        <main className="px-4 py-6 md:px-6 pb-20 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
