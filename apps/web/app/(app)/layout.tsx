import { auth, clerkClient } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Toaster } from "sonner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read admin role from Clerk `privateMetadata` (server-only). We first try
  // the session-token `metadata` claim (fast path — populated via a Clerk
  // session-token customization `{"metadata": "{{user.private_metadata}}"}`).
  // If the claim is missing (customization not yet configured, stale token,
  // or claim name mismatch), fall back to a direct Clerk backend-API lookup.
  // Either way, the role flag never reaches the client bundle.
  const { userId, sessionClaims } = await auth();

  let isAdmin = false;
  if (userId) {
    const claimMetadata = sessionClaims?.metadata as
      | { role?: string }
      | undefined;
    if (claimMetadata?.role === "admin") {
      isAdmin = true;
    } else {
      // Fallback: read privateMetadata directly from Clerk's backend API.
      // This covers the case where the session-token customization hasn't
      // been configured to expose `{{user.private_metadata}}` as a claim.
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const privateRole = (user.privateMetadata as { role?: string })?.role;
        isAdmin = privateRole === "admin";
      } catch {
        isAdmin = false;
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <Sidebar isAdmin={isAdmin} />
      <div className="md:pl-60">
        <Topbar />
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
