/** The Mag-7 instrument rows, shared by db:seed and db:seed:instruments. */
export const MAG7_INSTRUMENTS = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics" },
  { ticker: "MSFT", name: "Microsoft Corporation", sector: "Technology", industry: "Software—Infrastructure" },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Technology", industry: "Internet Content & Information" },
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Cyclical", industry: "Internet Retail" },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Technology", industry: "Semiconductors" },
  { ticker: "META", name: "Meta Platforms Inc.", sector: "Technology", industry: "Internet Content & Information" },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Consumer Cyclical", industry: "Auto Manufacturers" },
].map((i) => ({
  ...i,
  assetClass: "equity" as const,
  exchange: "NASDAQ" as const,
  marketCapBucket: "mega",
  isActive: true,
}));

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal", "postgres"];

/**
 * Stops a seed script before it connects, unless DATABASE_URL is local or
 * SEED_ALLOW_REMOTE names its host exactly. Returns the connection string.
 */
export function requireSeedTarget(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // postgres.js lets a ?host= parameter override the URL's host.
  const url = new URL(connectionString);
  const host = (url.searchParams.get("host") ?? url.hostname).replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTS.includes(host) || process.env.SEED_ALLOW_REMOTE === host) {
    return connectionString;
  }
  throw new Error(
    `Refusing to seed ${host || "an unnamed host"}: it is not local. To seed it anyway, set SEED_ALLOW_REMOTE to exactly that host.`,
  );
}
