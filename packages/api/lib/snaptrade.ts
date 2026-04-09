import { Snaptrade } from "snaptrade-typescript-sdk";

/**
 * SnapTrade SDK wrapper — READ-ONLY access.
 *
 * CRITICAL INVARIANT (from CLAUDE.md §6): Deepmint never places trades.
 * This wrapper deliberately exposes only read methods (registerUser,
 * loginLink, listAccounts, getAccountActivities). The SDK's trading APIs
 * are NEVER imported here.
 */

let cachedClient: Snaptrade | null = null;

export function getSnapTradeClient(): Snaptrade | null {
  if (cachedClient) return cachedClient;

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  if (!clientId || !consumerKey) {
    return null;
  }

  cachedClient = new Snaptrade({
    clientId,
    consumerKey,
  });

  return cachedClient;
}

export interface SnapTradeUserCredentials {
  userId: string;
  userSecret: string;
}

/**
 * Register a new SnapTrade user. The returned userSecret must be stored
 * securely — it's required for all subsequent API calls.
 */
export async function registerUser(
  userId: string,
): Promise<SnapTradeUserCredentials> {
  const client = getSnapTradeClient();
  if (!client) {
    throw new Error("SnapTrade not configured");
  }

  const response = await client.authentication.registerSnapTradeUser({
    userId,
  });

  const secret =
    (response.data as { userSecret?: string }).userSecret ?? undefined;

  if (!secret) {
    throw new Error("SnapTrade did not return a userSecret");
  }

  return {
    userId,
    userSecret: secret,
  };
}

/**
 * Get the SnapTrade Connection Portal URL for OAuth broker linking.
 */
export async function getLoginLink(
  credentials: SnapTradeUserCredentials,
): Promise<string> {
  const client = getSnapTradeClient();
  if (!client) {
    throw new Error("SnapTrade not configured");
  }

  const response = await client.authentication.loginSnapTradeUser({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
  });

  const redirectUri =
    (response.data as { redirectURI?: string }).redirectURI ?? undefined;

  if (!redirectUri) {
    throw new Error("SnapTrade did not return a redirect URI");
  }

  return redirectUri;
}

export interface SnapTradeAccount {
  id: string;
  brokerageName: string | null;
  accountName: string | null;
}

/**
 * List the broker accounts a user has linked.
 */
export async function listAccounts(
  credentials: SnapTradeUserCredentials,
): Promise<SnapTradeAccount[]> {
  const client = getSnapTradeClient();
  if (!client) return [];

  const response = await client.accountInformation.listUserAccounts({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
  });

  const data = (response.data as unknown[]) ?? [];
  return data.map((acct) => {
    const a = acct as {
      id?: string;
      institution_name?: string;
      name?: string;
    };
    return {
      id: a.id ?? "",
      brokerageName: a.institution_name ?? null,
      accountName: a.name ?? null,
    };
  });
}

export interface SnapTradeActivity {
  symbol: string;
  action: string;            // BUY | SELL | DIVIDEND | ...
  quantity: number;
  priceDollars: number;
  executedAt: Date;
  currency: string;
}

/**
 * Fetch trade activity for a single broker account. READ ONLY.
 */
export async function getAccountActivities(
  credentials: SnapTradeUserCredentials,
  accountId: string,
  startDate?: Date,
): Promise<SnapTradeActivity[]> {
  const client = getSnapTradeClient();
  if (!client) return [];

  const start =
    startDate ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    })();

  const response = await client.accountInformation.getAccountActivities({
    accountId,
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    startDate: start.toISOString().slice(0, 10),
  });

  const data = (response.data as unknown[]) ?? [];

  return data
    .map((entry) => {
      const e = entry as {
        symbol?: { symbol?: { symbol?: string } } | { symbol?: string };
        type?: string;
        units?: number;
        price?: number;
        trade_date?: string;
        settlement_date?: string;
        currency?: { code?: string };
      };

      // SnapTrade nests symbol in different shapes depending on endpoint
      const symbolObj = e.symbol as
        | { symbol?: { symbol?: string } | string }
        | undefined;
      const ticker =
        typeof symbolObj?.symbol === "string"
          ? symbolObj.symbol
          : typeof symbolObj?.symbol === "object"
            ? (symbolObj.symbol as { symbol?: string })?.symbol ?? ""
            : "";

      const dateStr = e.trade_date ?? e.settlement_date;
      return {
        symbol: ticker,
        action: (e.type ?? "").toUpperCase(),
        quantity: Number(e.units ?? 0),
        priceDollars: Number(e.price ?? 0),
        executedAt: dateStr ? new Date(dateStr) : new Date(),
        currency: e.currency?.code ?? "USD",
      };
    })
    .filter((a) => a.symbol && (a.action === "BUY" || a.action === "SELL"));
}

/**
 * Delete a SnapTrade user. Call on disconnect to revoke all tokens.
 */
export async function deleteUser(userId: string): Promise<void> {
  const client = getSnapTradeClient();
  if (!client) return;

  await client.authentication.deleteSnapTradeUser({ userId });
}
