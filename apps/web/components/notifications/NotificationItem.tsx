"use client";

import { UserPlus, Target, TrendingUp, Bell, Copy } from "lucide-react";

interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    isRead: boolean;
    createdAt: Date;
  };
  onMarkRead: (id: string) => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  new_follower: UserPlus,
  outcome_matured: Target,
  rank_change: TrendingUp,
  signal_trade_logged: Copy,
  new_claim_from_follow: Bell,
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
        notification.isRead
          ? "opacity-60"
          : "bg-accent/5 cursor-pointer hover:bg-accent/10"
      }`}
      onClick={() => {
        if (!notification.isRead) {
          onMarkRead(notification.id);
        }
      }}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          notification.isRead ? "bg-bg-tertiary" : "bg-accent/10"
        }`}
      >
        <Icon
          className={`h-3.5 w-3.5 ${
            notification.isRead ? "text-text-muted" : "text-accent"
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary">{notification.title}</p>
        {notification.body && (
          <p className="mt-0.5 text-xs text-text-muted truncate">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-[10px] text-text-muted">
          {timeAgo(notification.createdAt)}
        </p>
      </div>
      {!notification.isRead && (
        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
      )}
    </div>
  );
}
