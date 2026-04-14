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
  FileText,
  Shield,
  Database,
  KeyRound,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Explore", href: "/explore", icon: Search },
  { label: "My Claims", href: "/my-claims", icon: ClipboardList },
  { label: "Paper Portfolio", href: "/paper-portfolio", icon: Briefcase },
  { label: "Signal Simulate", href: "/signal-simulate", icon: Copy },
  { label: "Learn", href: "/learn", icon: GraduationCap },
  { label: "API Docs", href: "/docs/api", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { label: "Claim Review", href: "/admin/review", icon: Shield },
  { label: "Instruments", href: "/admin/instruments", icon: Database },
  { label: "API Keys", href: "/admin/api-keys", icon: KeyRound },
];

interface MobileNavProps {
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ isAdmin, open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 border-border bg-bg-secondary p-0"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Link href="/dashboard" onClick={() => onOpenChange(false)}>
            <Image
              src="/logo-sidebar.png"
              alt="Deepmint"
              width={280}
              height={64}
              className="h-7 w-auto"
            />
          </Link>
        </SheetHeader>

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
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
      </SheetContent>
    </Sheet>
  );
}
