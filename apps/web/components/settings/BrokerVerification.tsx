"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Link2,
  Link2Off,
  RefreshCw,
} from "lucide-react";

function formatDate(date: Date | string | null): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString();
}

export function BrokerVerification() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.broker.status.useQuery();

  const initMutation = trpc.broker.initLink.useMutation({
    onSuccess: (res) => {
      window.location.href = res.redirectUri;
    },
    onError: (err) =>
      toast.error("Could not start broker link", { description: err.message }),
  });

  const completeMutation = trpc.broker.completeLink.useMutation({
    onSuccess: (res) => {
      toast.success(`Verified with ${res.brokerName ?? "your broker"}`);
      utils.broker.status.invalidate();
    },
    onError: (err) =>
      toast.error("Verification failed", { description: err.message }),
  });

  const syncMutation = trpc.broker.syncTrades.useMutation({
    onSuccess: (res) => {
      toast.success(`Synced ${res.synced} trade(s)`);
      utils.broker.status.invalidate();
    },
    onError: (err) =>
      toast.error("Sync failed", { description: err.message }),
  });

  const disconnectMutation = trpc.broker.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Broker disconnected");
      utils.broker.status.invalidate();
    },
    onError: (err) =>
      toast.error("Disconnect failed", { description: err.message }),
  });

  // Handle return from SnapTrade OAuth
  useEffect(() => {
    if (searchParams.get("snaptrade_success") === "true") {
      completeMutation.mutate();
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading broker status...
      </div>
    );
  }

  if (!data?.snaptradeConfigured) {
    return (
      <div className="rounded border border-border/50 bg-bg-primary p-4">
        <p className="text-sm text-text-secondary">
          Broker verification is not configured on this deployment.
        </p>
      </div>
    );
  }

  const link = data?.link;
  const verified = data?.entityVerified;

  // Verified state
  if (verified && link && link.syncStatus === "active") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <Badge
            variant="outline"
            className="border-accent/30 text-accent"
          >
            Verified
          </Badge>
          <span className="text-sm text-text-primary">
            {link.brokerName ?? "Broker connected"}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          Last sync: {formatDate(link.lastSyncAt)}. Your verified trades
          receive a 1.5&times; multiplier in consensus scoring.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="border-border text-text-secondary hover:text-text-primary"
          >
            <RefreshCw
              className={`mr-1 h-3 w-3 ${
                syncMutation.isPending ? "animate-spin" : ""
              }`}
            />
            Sync Now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="border-red-500/30 text-red-500 hover:bg-red-500/10"
          >
            <Link2Off className="mr-1 h-3 w-3" />
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (link && link.syncStatus === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <Badge variant="outline" className="border-red-500/30 text-red-500">
            Sync Error
          </Badge>
        </div>
        <p className="text-xs text-red-500">{link.syncErrorMessage}</p>
        <Button
          size="sm"
          onClick={() => refetch()}
          className="bg-accent text-bg-primary hover:bg-accent-hover"
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  // Pending state
  if (link && link.syncStatus === "pending") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Completing verification...
        </div>
        <Button
          size="sm"
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="bg-accent text-bg-primary hover:bg-accent-hover"
        >
          Complete Verification
        </Button>
      </div>
    );
  }

  // Unlinked state
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Connect your brokerage for read-only trade verification. Verified
        Player claims receive a <strong>1.5&times;</strong> multiplier in
        consensus scoring.
      </p>
      <ul className="space-y-1 text-xs text-text-muted">
        <li>&middot; Deepmint never places trades on your behalf</li>
        <li>&middot; Only trade history is fetched (symbol, side, price, date)</li>
        <li>&middot; Balances and account numbers are never accessed</li>
      </ul>
      <Button
        onClick={() => initMutation.mutate({ provider: "snaptrade" })}
        disabled={initMutation.isPending}
        className="bg-accent text-bg-primary hover:bg-accent-hover"
      >
        <Link2 className="mr-1 h-4 w-4" />
        {initMutation.isPending ? "Connecting..." : "Connect Broker"}
      </Button>
    </div>
  );
}
