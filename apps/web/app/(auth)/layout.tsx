export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0F1A]">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex justify-center">
          <img
            src="/logo.png"
            alt="Deepmint"
            className="h-10 w-auto"
          />
        </div>
        <div className="flex justify-center">{children}</div>
      </div>
    </div>
  );
}
