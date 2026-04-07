"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
      <p className="font-mono text-4xl font-bold text-red-500">Error</p>
      <h1 className="mt-4 text-xl font-semibold text-text-primary">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-center text-text-secondary">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-accent px-6 py-2.5 font-medium text-bg-primary transition-colors hover:bg-accent/90"
      >
        Try Again
      </button>
    </div>
  );
}
