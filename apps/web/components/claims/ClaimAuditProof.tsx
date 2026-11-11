"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ProofStep {
  hash: string;
  position: "left" | "right";
}

/** SHA-256 of a string, hex, with the browser's own WebCrypto. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The claim as the page shows it, to hold the hashed text against. */
export interface ShownClaim {
  id: string;
  direction: string;
  horizonDays: number;
  /** ISO 8601 */
  createdAt: string;
}

/** The fields a leaf payload states about its claim, for either leaf version. */
function payloadClaim(payload: string, leafVersion: number): ShownClaim | null {
  try {
    if (leafVersion === 1) {
      const [id, , , direction, horizon, createdAt] = payload.split("|");
      return { id: id!, direction: direction!, horizonDays: Number(horizon), createdAt: createdAt! };
    }
    const fields = JSON.parse(payload) as unknown[];
    return {
      id: String(fields[0]),
      direction: String(fields[4]),
      horizonDays: Number(fields[6]),
      createdAt: String(fields[17]),
    };
  } catch {
    return null;
  }
}

type Check = { ok: true } | { ok: false; reason: string };

/**
 * Check a proof without trusting the server's word for it: hash the leaf text,
 * confirm it names this claim, and fold the proof up to the published root.
 */
async function verifyInBrowser(input: {
  claim: ShownClaim;
  leafVersion: number;
  leafPayload: string;
  leafHash: string;
  proof: ProofStep[];
  merkleRoot: string;
}): Promise<Check> {
  const stated = payloadClaim(input.leafPayload, input.leafVersion);
  if (
    !stated ||
    stated.id !== input.claim.id ||
    stated.direction !== input.claim.direction ||
    stated.horizonDays !== input.claim.horizonDays ||
    stated.createdAt !== input.claim.createdAt
  ) {
    return { ok: false, reason: "The hashed text does not match the claim shown above." };
  }
  let node = await sha256Hex(input.leafPayload);
  if (node !== input.leafHash) {
    return { ok: false, reason: "The claim's text does not hash to its leaf." };
  }
  for (const step of input.proof) {
    node = await sha256Hex(step.position === "left" ? step.hash + node : node + step.hash);
  }
  return node === input.merkleRoot
    ? { ok: true }
    : { ok: false, reason: "The proof does not lead to the published root." };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A claim's place in the published daily Merkle roots, checked in the browser. */
export function ClaimAuditProof({
  claim,
  showRootsLink,
}: {
  claim: ShownClaim;
  /** /audit is for signed-in users; signed out, the link would lead to sign-in. */
  showRootsLink: boolean;
}) {
  const claimId = claim.id;
  const { data, isLoading, error } = trpc.claims.auditProof.useQuery({ claimId });
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);

  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton className="h-16 w-full" />;
  } else if (error || !data) {
    body = (
      <p className="text-sm text-text-secondary">The audit proof could not be loaded.</p>
    );
  } else if (data.status === "awaiting") {
    body = (
      <p className="text-sm text-text-secondary">
        Not audited yet. Claims recorded on {data.date} go into that day&apos;s root,
        published after 22:00 UTC on {addDays(data.date, 1)}.
      </p>
    );
  } else if (data.status === "missing") {
    body = (
      <p className="text-sm text-text-secondary">
        {data.reason === "went_by_date"
          ? `No published root covers this claim. The root for ${data.date}, the day it was stored, is from the first audit (leaf version 1), which went by each claim's own date.`
          : data.reason === "built_before_stored"
            ? `No published root covers this claim. The root for ${data.root.date}, its own date, is from the first audit (leaf version 1) and was built before this claim was stored.`
            : `No published root covers this claim: none was published for ${data.date}, the day it was stored.`}
      </p>
    );
  } else if (data.status === "unrecomputable") {
    body = (
      <p className="text-sm text-text-secondary">
        This claim falls in the root for {data.root.date}, but that root cannot be rebuilt
        from the ledger as it stands, so no proof is shown.
        {data.root.leafVersion === 1 &&
          " Roots from the first audit (leaf version 1) hashed claims in an order the ledger cannot always reproduce."}
      </p>
    );
  } else {
    const proof = data;
    const runCheck = async () => {
      setChecking(true);
      try {
        setCheck(
          await verifyInBrowser({
            claim,
            leafVersion: proof.root.leafVersion,
            leafPayload: proof.leafPayload,
            leafHash: proof.leafHash,
            proof: proof.proof,
            merkleRoot: proof.root.merkleRoot,
          }),
        );
      } catch {
        setCheck({ ok: false, reason: "This browser could not run the check." });
      } finally {
        setChecking(false);
      }
    };
    body = (
      <div className="space-y-4">
        <dl className="space-y-3">
          <Row label="Root">
            {proof.root.date}, {proof.root.claimCount} claim
            {proof.root.claimCount === 1 ? "" : "s"}
          </Row>
          <Row label="Root hash">
            <code className="font-mono text-xs break-all text-text-secondary">
              {proof.root.merkleRoot}
            </code>
          </Row>
          <Row label="This claim">
            Leaf {proof.leafIndex + 1} of {proof.root.claimCount}, {proof.proof.length} step
            {proof.proof.length === 1 ? "" : "s"} to the root
          </Row>
          <Row label="Leaf hash">
            <code className="font-mono text-xs break-all text-text-secondary">
              {proof.leafHash}
            </code>
          </Row>
        </dl>
        <details className="text-sm">
          <summary className="cursor-pointer text-text-secondary">
            What was hashed (leaf version {proof.root.leafVersion})
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-primary p-2 font-mono text-xs text-text-secondary">
            {proof.leafPayload}
          </pre>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={runCheck}
            disabled={checking}
            className="border-border"
          >
            {checking ? "Checking…" : "Verify in your browser"}
          </Button>
          {check?.ok && (
            <span className="inline-flex items-center gap-1 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              Verified: this claim hashes into the published root.
            </span>
          )}
          {check && !check.ok && (
            <span className="inline-flex items-center gap-1 text-sm text-red-500">
              <XCircle className="h-4 w-4" />
              {check.reason}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Audit proof</h2>
        {showRootsLink && (
          <Link href="/audit" className="text-xs text-accent hover:underline">
            All published roots
          </Link>
        )}
      </div>
      {body}
    </section>
  );
}
