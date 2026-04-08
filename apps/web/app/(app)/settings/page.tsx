"use client";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Bell } from "lucide-react";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.social.emailPreferences.useQuery();

  const updateMutation = trpc.social.updateEmailPreferences.useMutation({
    onSuccess: () => {
      utils.social.emailPreferences.invalidate();
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-text-secondary">
          Account preferences and notifications.
        </p>
      </div>

      {/* Email Preferences */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-semibold text-text-primary">
            Email Notifications
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preferences...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Digest toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Daily Digest
                </p>
                <p className="text-xs text-text-secondary">
                  AI-generated summary of new predictions, outcomes, and signal
                  changes from analysts you follow.
                </p>
              </div>
              <button
                onClick={() =>
                  updateMutation.mutate({
                    digestEnabled: !prefs?.digestEnabled,
                  })
                }
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  prefs?.digestEnabled
                    ? "bg-accent"
                    : "bg-bg-tertiary"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    prefs?.digestEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Frequency selector */}
            {prefs?.digestEnabled && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-secondary">Frequency:</span>
                <div className="flex gap-2">
                  <Button
                    variant={
                      prefs?.digestFrequency === "daily"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      updateMutation.mutate({
                        digestEnabled: true,
                        digestFrequency: "daily",
                      })
                    }
                    className={
                      prefs?.digestFrequency === "daily"
                        ? "bg-accent text-bg-primary"
                        : "border-border text-text-secondary"
                    }
                  >
                    Daily
                  </Button>
                  <Button
                    variant={
                      prefs?.digestFrequency === "weekly"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      updateMutation.mutate({
                        digestEnabled: true,
                        digestFrequency: "weekly",
                      })
                    }
                    className={
                      prefs?.digestFrequency === "weekly"
                        ? "bg-accent text-bg-primary"
                        : "border-border text-text-secondary"
                    }
                  >
                    Weekly
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* In-App Notification Preferences */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-semibold text-text-primary">
            In-App Notifications
          </h2>
        </div>
        <NotificationPreferences />
      </div>

      {/* Broker Verification */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          Broker Verification
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Connect your brokerage account to verify your trades and earn a
          verified badge. Coming soon.
        </p>
      </div>
    </div>
  );
}
