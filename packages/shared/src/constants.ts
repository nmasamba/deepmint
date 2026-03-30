export const MAG7_TICKERS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
] as const;

export type Mag7Ticker = (typeof MAG7_TICKERS)[number];

export const VALID_HORIZONS = [1, 7, 30, 90, 180, 365] as const;
export type ValidHorizon = (typeof VALID_HORIZONS)[number];

export const RATIONALE_TAGS = [
  "earnings",
  "technical",
  "macro",
  "sector",
  "catalyst",
  "valuation",
  "momentum",
  "contrarian",
  "insider",
  "regulatory",
] as const;

export const CLAIM_RATE_LIMIT = 10; // per hour per user

export const BPS_PER_PERCENT = 100;
export const CENTS_PER_DOLLAR = 100;
