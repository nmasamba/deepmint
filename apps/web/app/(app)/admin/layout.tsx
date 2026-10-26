import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { resolveIsAdmin } from "@/lib/adminRole";

/** Admin pages exist only for admins; anyone else gets a 404. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  if (!(await resolveIsAdmin(userId, sessionClaims))) notFound();
  return <>{children}</>;
}
