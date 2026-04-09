"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, ShieldOff, Check } from "lucide-react";

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const ALL_SCOPES = [
  { id: "scores:read", label: "scores:read" },
  { id: "consensus:read", label: "consensus:read" },
  { id: "leaderboard:read", label: "leaderboard:read" },
] as const;

type ScopeId = (typeof ALL_SCOPES)[number]["id"];

export default function AdminApiKeysPage() {
  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.apiKeys.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [scopes, setScopes] = useState<ScopeId[]>([
    "scores:read",
    "consensus:read",
    "leaderboard:read",
  ]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (result) => {
      setNewKey(result.key);
      utils.apiKeys.list.invalidate();
    },
    onError: (err) =>
      toast.error("Create failed", { description: err.message }),
  });

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      toast.success("API key revoked");
      utils.apiKeys.list.invalidate();
    },
    onError: (err) =>
      toast.error("Revoke failed", { description: err.message }),
  });

  const toggleScope = (scope: ScopeId) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (scopes.length === 0) {
      toast.error("At least one scope is required");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      rateLimit,
      scopes: scopes as [ScopeId, ...ScopeId[]],
    });
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setName("");
      setRateLimit(60);
      setScopes(["scores:read", "consensus:read", "leaderboard:read"]);
      setNewKey(null);
      setCopied(false);
    }
  };

  const handleRevoke = (id: string, name: string) => {
    if (!confirm(`Revoke "${name}"? This cannot be undone.`)) return;
    revokeMutation.mutate({ id });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">API Keys</h1>
          <p className="mt-1 text-text-secondary">
            Manage B2B API keys for external clients. Keys are shown in
            plaintext exactly once at creation.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-accent text-bg-primary hover:bg-accent-hover"
        >
          <Plus className="mr-1 h-4 w-4" />
          New API Key
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (keys ?? []).length === 0 ? (
          <div className="p-10 text-center">
            <KeyRound className="mx-auto h-10 w-10 text-text-secondary" />
            <p className="mt-3 text-text-secondary">
              No API keys yet. Create one to get started.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg-tertiary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Scopes</th>
                <th className="px-4 py-3 font-medium">Rate limit</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(keys ?? []).map((k) => (
                <tr key={k.id} className="hover:bg-bg-tertiary/50">
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {k.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {k.keyPrefix}…
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(k.scopes ?? []).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="border-border text-xs text-text-secondary"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-secondary">
                    {k.rateLimit}/min
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {k.lastUsedAt
                      ? relativeTime(new Date(k.lastUsedAt))
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        k.isActive
                          ? "border-green-500/30 text-green-500"
                          : "border-red-500/30 text-red-500"
                      }
                    >
                      {k.isActive ? "Active" : "Revoked"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {k.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevoke(k.id, k.name)}
                        disabled={revokeMutation.isPending}
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                      >
                        <ShieldOff className="mr-1 h-3 w-3" />
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="bg-bg-secondary border-border">
          {newKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-text-primary">
                  API key created
                </DialogTitle>
                <DialogDescription className="text-text-secondary">
                  Copy this key now. For security, it will never be shown
                  again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
                  Store this key in a secure secret manager. If you lose it,
                  you must create a new one.
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-accent">
                    {newKey}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                    className="border-border text-text-secondary hover:text-text-primary"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => handleDialogClose(false)}
                  className="bg-accent text-bg-primary hover:bg-accent-hover"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-text-primary">
                  Create API key
                </DialogTitle>
                <DialogDescription className="text-text-secondary">
                  Issue a new Bearer token for B2B REST API access.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-text-primary">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Corp – Production"
                    className="bg-bg-primary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rateLimit" className="text-text-primary">
                    Rate limit (requests per minute)
                  </Label>
                  <Input
                    id="rateLimit"
                    type="number"
                    min={1}
                    max={10000}
                    value={rateLimit}
                    onChange={(e) =>
                      setRateLimit(parseInt(e.target.value) || 60)
                    }
                    className="bg-bg-primary border-border font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-primary">Scopes</Label>
                  <div className="space-y-2">
                    {ALL_SCOPES.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={scopes.includes(s.id)}
                          onChange={() => toggleScope(s.id)}
                          className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
                        />
                        <span className="font-mono">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                  className="border-border text-text-secondary"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="bg-accent text-bg-primary hover:bg-accent-hover"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
