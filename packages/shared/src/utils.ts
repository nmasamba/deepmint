/**
 * Convert a name or handle into a URL-safe slug: lowercase ASCII letters and
 * digits, every other run of characters one hyphen, no hyphen at either end,
 * at most 100 characters (entities.slug). Returns `fallback` when nothing is
 * left. Players and Guides share one slug namespace, so both paths use this.
 */
export function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || fallback;
}

/**
 * A Clerk user's display name: first and last name, else the username, else
 * "User". The sign-up webhook and the tRPC self-heal both use it.
 */
export function clerkDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    "User"
  );
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
