"use client";

import Link from "next/link";
import Image from "next/image";
import { UserButton, useUser } from "@clerk/nextjs";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import { SubmitClaimForm } from "@/components/claims/SubmitClaimForm";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useRouter } from "next/navigation";

export function Topbar() {
  const router = useRouter();
  const { isSignedIn } = useUser();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-bg-primary/80 px-4 backdrop-blur-sm md:px-6">
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
  );
}
