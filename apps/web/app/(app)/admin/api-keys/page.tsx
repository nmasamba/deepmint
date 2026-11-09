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
import Link from "next/link";
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
  { id: "claims:write", label: "claims:write" },
] as const;

type ScopeId = (typeof ALL_SCOPES)[number]["id"];

const DEFAULT_SCOPES: ScopeId[] = [
  "scores:read",
  "consensus:read",
  "leaderboard:read",
];

/** Expiry choices, in days; null never expires. */
const EXPIRY_OPTIONS = [
  { value: "never", label: "Never", days: null },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
] as const;

type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]["value"];

/** A native select styled like the dialog's inputs. */
const selectClass =
  "h-9 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";

export default function AdminApiKeysPage() {
  const utils = trpc.useUtils();
  const { data: keys, isLoading, error } = trpc.apiKeys.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [scopes, setScopes] = useState<ScopeId[]>(DEFAULT_SCOPES);
  const [expiry, setExpiry] = useState<ExpiryValue>("never");
  // A claims:write key acts as an agent Player: a new one by name, or an
  // existing one by id (to give it a fresh key). Never as the admin.
  const [agentMode, setAgentMode] = useState<"new" | "existing">("new");
  const [agentName, setAgentName] = useState("");
  const [agentEntityId, setAgentEntityId] = useState("");
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

  // Agents that already hold a key, for giving one a new key. A deleted
  // agent cannot write, so it is not offered.
  const agents = [
    ...new Map(
      (keys ?? [])
        .filter((k) => k.entityId && k.agentName && !k.agentDeleted)
        .map((k) => [k.entityId!, k.agentName!]),
    ),
  ].map(([id, displayName]) => ({ id, displayName }));
  const writes = scopes.includes("claims:write");

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
    if (writes && agentMode === "new" && !agentName.trim()) {
      toast.error("Name the agent this key writes as");
      return;
    }
    if (writes && agentMode === "existing" && !agentEntityId) {
      toast.error("Choose the agent this key writes as");
      return;
    }
    const days = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null;
    createMutation.mutate({
      name: name.trim(),
      rateLimit,
      scopes: scopes as [ScopeId, ...ScopeId[]],
      expiresAt: days ? new Date(Date.now() + days * 86_400_000) : undefined,
      // Only a writing key is bound to an agent; a read key acts as no one.
      agentName: writes && agentMode === "new" ? agentName.trim() : undefined,
      agentEntityId:
        writes && agentMode === "existing" ? agentEntityId : undefined,
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
      setScopes(DEFAULT_SCOPES);
      setExpiry("never");
      setAgentMode("new");
      setAgentName("");
      setAgentEntityId("");
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
        ) : error ? (
          <div className="p-10 text-center text-red-400">
            Could not load API keys: {error.message}
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
                <th className="px-4 py-3 font-medium">Acts as</th>
                <th className="px-4 py-3 font-medium">Rate limit</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(keys ?? []).map((k) => {
                const expired =
                  k.expiresAt !== null && new Date(k.expiresAt) < new Date();
                return (
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
                    <td className="px-4 py-3 text-text-secondary">
                      {k.agentSlug ? (
                        <Link
                          href={`/player/${k.agentSlug}`}
                          className="text-text-primary hover:text-accent"
                        >
                          {k.agentName}
                        </Link>
                      ) : (k.scopes ?? []).includes("claims:write") ? (
                        // Minted before agents existed: it cannot write.
                        "No agent (cannot write)"
                      ) : (
                        "No one (read only)"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-secondary">
                      {k.rateLimit}/min
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {k.expiresAt
                        ? new Date(k.expiresAt).toISOString().slice(0, 10)
                        : "Never"}
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
                          k.isActive && !expired
                            ? "border-green-500/30 text-green-500"
                            : "border-red-500/30 text-red-500"
                        }
                      >
                        {!k.isActive ? "Revoked" : expired ? "Expired" : "Active"}
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
                );
              })}
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
                  Issue a new Bearer token for the REST API and the MCP
                  server.
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
                {writes && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <Label className="text-text-primary">Writes as</Label>
                    <p className="text-xs text-text-secondary">
                      A claims:write key submits claims and notes as an AI
                      agent: a Player of its own, scored like anyone, never as
                      you.
                    </p>
                    <select
                      aria-label="Agent"
                      value={agentMode}
                      onChange={(e) =>
                        setAgentMode(e.target.value as "new" | "existing")
                      }
                      className={selectClass}
                    >
                      <option value="new">A new agent</option>
                      {agents.length > 0 && (
                        <option value="existing">An existing agent</option>
                      )}
                    </select>
                    {agentMode === "new" ? (
                      <Input
                        aria-label="Agent name"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="Agent name, shown on its profile"
                        maxLength={100}
                        className="bg-bg-primary border-border"
                      />
                    ) : (
                      <select
                        aria-label="Existing agent"
                        value={agentEntityId}
                        onChange={(e) => setAgentEntityId(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Choose an agent</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.displayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="expiry" className="text-text-primary">
                    Expires
                  </Label>
                  <select
                    id="expiry"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value as ExpiryValue)}
                    className={selectClass}
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
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
