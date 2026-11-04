"use client";

import Link from "next/link";
import { UserPlus, Target, TrendingUp, Bell, Copy } from "lucide-react";

interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    metadata: Record<string, unknown> | null;
    isRead: boolean;
    createdAt: Date;
  };
  onMarkRead: (id: string) => void;
  /** Called when following the notification's link. */
  onNavigate: () => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  new_follower: UserPlus,
  outcome_matured: Target,
  rank_change: TrendingUp,
  signal_trade_logged: Copy,
  signal_trade_skipped: Copy,
  new_claim_from_follow: Bell,
};

/** Where a notification leads. Rows older than a link's metadata have none. */
function notificationHref({ type, metadata }: NotificationItemProps["notification"]): string | null {
  switch (type) {
    case "outcome_matured":
    case "new_claim_from_follow":
      return typeof metadata?.claimId === "string" ? `/claims/${metadata.claimId}` : null;
    case "new_follower":
      return typeof metadata?.followerSlug === "string"
        ? `/${metadata.followerType}/${metadata.followerSlug}`
        : null;
    case "rank_change":
      return "/leaderboard";
    case "signal_trade_logged":
    case "signal_trade_skipped":
      return "/signal-simulate";
    default:
      return null;
  }
}

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

export function NotificationItem({ notification, onMarkRead, onNavigate }: NotificationItemProps) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const href = notificationHref(notification);

  const className = `flex items-start gap-3 px-4 py-3 transition-colors ${
    notification.isRead
      ? `opacity-60 ${href ? "hover:opacity-100" : ""}`
      : "bg-accent/5 cursor-pointer hover:bg-accent/10"
  }`;
  const markRead = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
  };

  const content = (
    <>
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
    </>
  );

  return href ? (
    <Link
      href={href}
      className={className}
      onClick={() => {
        markRead();
        onNavigate();
      }}
    >
      {content}
    </Link>
  ) : (
    <div className={className} onClick={markRead}>
      {content}
    </div>
  );
}
