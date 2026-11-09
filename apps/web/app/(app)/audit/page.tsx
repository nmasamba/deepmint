"use client";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The published daily Merkle roots of the claims ledger. */
export default function AuditPage() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.claims.auditRoots.useInfiniteQuery(
      { limit: 30 },
      { getNextPageParam: (last) => last.nextCursor },
    );
  const roots = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Audit roots</h1>
        <div className="mt-2 space-y-2 text-sm text-text-secondary">
          <p>
            Every night at 22:00 UTC, Deepmint hashes each claim recorded the day before,
            every field but its review status, and combines the hashes into one Merkle
            root. The roots are listed here. A claim&apos;s page shows its proof against
            its day&apos;s root, and your browser can check it.
          </p>
          <p>
            A root shows that a claim has not changed since the root was published, to
            anyone who kept a copy of the root. The roots are not yet anchored to a public
            blockchain, so keep a copy if you need that.
          </p>
          <p>
            Leaf version 1 roots, from the first audit, cover fewer fields, went by each
            claim&apos;s own date, and may not rebuild from the ledger; their claim pages
            say so when they cannot.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-secondary">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-8 text-center text-sm text-red-400">
            Could not load the roots: {error.message}
          </p>
        ) : roots.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-secondary">
            No root has been published yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg-tertiary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Day (UTC)</th>
                <th className="px-4 py-3 font-medium text-right">Claims</th>
                <th className="px-4 py-3 font-medium text-right">Leaf version</th>
                <th className="px-4 py-3 font-medium">Root</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roots.map((root) => (
                <tr key={root.date}>
                  <td className="whitespace-nowrap px-4 py-3 text-text-primary">{root.date}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">
                    {root.claimCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">
                    {root.leafVersion}
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs break-all text-text-secondary">
                      {root.merkleRoot}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasNextPage && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="border-border"
          >
            {isFetchingNextPage ? "Loading…" : "Older roots"}
          </Button>
        </div>
      )}
    </div>
  );
}
