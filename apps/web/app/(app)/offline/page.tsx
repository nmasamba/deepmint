"use client";

import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <WifiOff className="h-16 w-16 text-text-muted" />
      <h1 className="mt-6 text-2xl font-bold text-text-primary">
        You&apos;re offline
      </h1>
      <p className="mt-2 max-w-sm text-text-secondary">
        Deepmint requires an internet connection to fetch live market data and
        analyst predictions. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-bg-primary hover:bg-accent-hover transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
