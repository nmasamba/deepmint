"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserButton, useUser } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import { SubmitClaimForm } from "@/components/claims/SubmitClaimForm";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MobileNav } from "@/components/layout/MobileNav";
import { useRouter } from "next/navigation";

interface TopbarProps {
  isAdmin: boolean;
}

export function Topbar({ isAdmin }: TopbarProps) {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-bg-primary/80 px-4 backdrop-blur-sm md:px-6">
        {/* Hamburger (mobile only) */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="mr-2 rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo (mobile only — desktop has sidebar logo) */}
        <Link href="/dashboard" className="md:hidden mr-3 shrink-0">
          <Image
            src="/logo-sidebar.png"
            alt="Deepmint"
            width={280}
            height={64}
            className="h-6 w-auto"
            priority
          />
        </Link>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <InstrumentSearch
            onSelect={(instrument) => {
              router.push(`/ticker/${instrument.ticker}`);
            }}
          />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {isSignedIn && <SubmitClaimForm />}
          {isSignedIn && <NotificationBell />}
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
        </div>
      </header>

      <MobileNav
        isAdmin={isAdmin}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      />
    </>
  );
}
