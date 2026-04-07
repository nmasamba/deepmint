"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0F1A] px-4">
          <p className="font-mono text-4xl font-bold text-red-500">Error</p>
          <h1 className="mt-4 text-xl font-semibold text-[#E2E8F0]">
            Something went wrong
          </h1>
          <p className="mt-2 max-w-md text-center text-[#94A3B8]">
            {error.message || "A critical error occurred."}
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-[#2DD4BF] px-6 py-2.5 font-medium text-[#0A0F1A] hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
