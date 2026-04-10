"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Trophy,
  Search,
  ClipboardList,
  Briefcase,
  Copy,
  GraduationCap,
  Settings,
  Shield,
  Database,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Only show for specific entity types */
  entityType?: "player" | "guide" | "watcher";
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Explore", href: "/explore", icon: Search },
  {
    label: "My Claims",
    href: "/my-claims",
    icon: ClipboardList,
    entityType: "player",
  },
  {
    label: "Paper Portfolio",
    href: "/paper-portfolio",
    icon: Briefcase,
  },
  {
    label: "Signal Simulate",
    href: "/signal-simulate",
    icon: Copy,
  },
  { label: "Learn", href: "/learn", icon: GraduationCap },
  { label: "Settings", href: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { label: "Claim Review", href: "/admin/review", icon: Shield },
  { label: "Instruments", href: "/admin/instruments", icon: Database },
  { label: "API Keys", href: "/admin/api-keys", icon: KeyRound },
];

interface SidebarProps {
  /**
   * Whether the current user has the admin role. Injected by the server-side
   * layout so we never need to read role metadata from the client-side Clerk
   * object — the flag is stored in Clerk `privateMetadata` and exposed only
   * via a signed session-token claim read on the server.
   */
  isAdmin: boolean;
}

export function Sidebar({ isAdmin }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 z-30">
        <div className="flex h-full flex-col border-r border-border bg-bg-secondary">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex h-16 items-center gap-2.5 border-b border-border px-5 transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo-sidebar.png"
              alt="Deepmint"
              width={280}
              height={64}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}

            {isAdmin && (
              <div className="pt-4">
                <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Admin
                </div>
                {adminNavItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent/10 text-accent"
                          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                      )}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Bottom section */}
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-text-muted">
              Mag 7 &middot; MVP
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-bg-secondary px-2 py-2 md:hidden">
        {navItems.slice(0, 5).map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs transition-colors",
                isActive
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
