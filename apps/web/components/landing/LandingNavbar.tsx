import Link from "next/link";
import Image from "next/image";

export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-bg-primary/80 px-4 backdrop-blur-sm sm:px-8">
      <Link href="/">
        <Image
          src="/logo-hero.png"
          alt="Deepmint"
          width={400}
          height={90}
          className="h-7 w-auto sm:h-8"
          priority
        />
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/sign-in"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-primary transition-colors hover:bg-accent/90"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}
