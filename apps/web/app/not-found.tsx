import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
      <Image
        src="/logo-sidebar.png"
        alt="Deepmint"
        width={280}
        height={64}
        className="mb-8 h-10 w-auto"
      />
      <p className="font-mono text-6xl font-bold text-accent">404</p>
      <h1 className="mt-4 text-xl font-semibold text-text-primary">
        Page Not Found
      </h1>
      <p className="mt-2 text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-accent px-6 py-2.5 font-medium text-bg-primary transition-colors hover:bg-accent/90"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
