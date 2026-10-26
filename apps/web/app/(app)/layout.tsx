import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Toaster } from "sonner";
import { resolveIsAdmin } from "@/lib/adminRole";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Admin role from Clerk privateMetadata, server-side only: the session
  // claim when present, else one cached backend lookup per user per 60 s.
  const { userId, sessionClaims } = await auth();
  const isAdmin = await resolveIsAdmin(userId, sessionClaims);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Sidebar isAdmin={isAdmin} />
      <div className="md:pl-60">
        <Topbar isAdmin={isAdmin} />
        <main className="px-4 py-6 md:px-6 pb-20 md:pb-6">{children}</main>
      </div>
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#111827",
            border: "1px solid #1f2937",
            color: "#E2E8F0",
          },
        }}
      />
    </div>
  );
}
