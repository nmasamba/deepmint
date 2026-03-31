"use client";

import { UserButton } from "@clerk/nextjs";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import { useRouter } from "next/navigation";

export function Topbar() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-bg-primary/80 px-4 backdrop-blur-sm md:px-6">
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
