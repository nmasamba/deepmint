"use client";

import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";

const PREF_LABELS: { key: string; label: string; description: string }[] = [
  {
    key: "newFollower",
    label: "New follower",
    description: "When someone starts following you",
  },
  {
    key: "outcomeMature",
    label: "Outcome matured",
    description: "When one of your predictions is resolved",
  },
  {
    key: "rankChange",
    label: "Rank change",
    description: "When your leaderboard position changes significantly",
  },
  {
    key: "newClaimFromFollow",
    label: "New claim from followed",
    description: "When someone you follow makes a prediction",
  },
  {
    key: "signalTradeLogged",
    label: "Signal trade logged",
    description: "When a trade is auto-logged in your signal portfolio",
  },
];

export function NotificationPreferences() {
  const { data: prefs, isLoading } =
    trpc.notifications.preferences.useQuery();

  const utils = trpc.useUtils();
  const update = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      utils.notifications.preferences.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {PREF_LABELS.map((pref) => {
        const currentValue =
          (prefs as Record<string, boolean> | undefined)?.[pref.key] ?? true;

        return (
          <label
            key={pref.key}
            className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <div>
              <span className="text-sm font-medium text-text-primary">
                {pref.label}
              </span>
              <p className="text-xs text-text-muted">{pref.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={currentValue}
              onClick={() =>
                update.mutate({ [pref.key]: !currentValue })
              }
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                currentValue ? "bg-accent" : "bg-bg-tertiary"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  currentValue ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        );
      })}
    </div>
  );
}
