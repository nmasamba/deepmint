"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldCheck } from "lucide-react";

interface EntityRow {
  entity: {
    id: string;
    displayName: string;
    slug: string;
    type: "player" | "guide";
    avatarUrl: string | null;
    isVerified: boolean | null;
    brokerLinkStatus: string | null;
  };
  metricValue: string;
  metricLabel: string;
}

interface TopEntitiesPanelProps {
  title: string;
  entities: EntityRow[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TopEntitiesPanel({ title, entities }: TopEntitiesPanelProps) {
  if (entities.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-medium uppercase text-text-secondary">
          {title}
        </h3>
        <p className="text-sm text-text-secondary/60">No data yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <h3 className="mb-3 text-sm font-medium uppercase text-text-secondary">
        {title}
      </h3>
      <div className="space-y-3">
        {entities.map((row, idx) => {
          const isVerified =
            row.entity.isVerified ||
            row.entity.brokerLinkStatus === "verified";
          const profilePath =
            row.entity.type === "guide"
              ? `/guide/${row.entity.slug}`
              : `/player/${row.entity.slug}`;

          return (
            <Link
              key={row.entity.id}
              href={profilePath}
              className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-bg-tertiary"
            >
              <span className="w-5 text-center font-mono text-xs text-text-secondary">
                {idx + 1}
              </span>
              <Avatar className="h-7 w-7">
                <AvatarImage
                  src={row.entity.avatarUrl ?? undefined}
                  alt={row.entity.displayName}
                />
                <AvatarFallback className="bg-bg-tertiary text-xs text-text-primary">
                  {getInitials(row.entity.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 truncate">
                <span className="text-sm text-text-primary">
                  {row.entity.displayName}
                </span>
                {isVerified && (
                  <ShieldCheck className="ml-1 inline h-3.5 w-3.5 text-accent" />
                )}
              </div>
              <div className="text-right">
                <span className="font-mono text-sm font-bold text-text-primary">
                  {row.metricValue}
                </span>
                <span className="ml-1 text-xs text-text-secondary">
                  {row.metricLabel}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
