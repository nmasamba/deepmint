import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-12">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div>
          <Image
            src="/logo-sidebar.png"
            alt="Deepmint"
            width={280}
            height={64}
            className="h-8 w-auto"
          />
          <p className="mt-1 text-xs text-text-secondary">
            AI-ranked analysts. Verified track records.
          </p>
        </div>

        <nav className="flex gap-6 text-sm text-text-secondary">
          <Link href="/leaderboard" className="hover:text-accent">
            Leaderboard
          </Link>
          <Link href="/learn" className="hover:text-accent">
            Learn
          </Link>
          <Link href="/sign-up" className="hover:text-accent">
            Sign Up
          </Link>
        </nav>

        <p className="text-xs text-text-secondary/60">
          &copy; {new Date().getFullYear()} Deepmint. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
