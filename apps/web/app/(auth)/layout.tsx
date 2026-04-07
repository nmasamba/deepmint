import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex justify-center">
          <Image
            src="/logo-hero.png"
            alt="Deepmint"
            width={400}
            height={90}
            className="h-10 w-auto"
            priority
          />
        </div>
        <div className="flex justify-center">{children}</div>
      </div>
    </div>
  );
}
