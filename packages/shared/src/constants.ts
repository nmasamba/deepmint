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

/** Score horizons: "all" pools every horizon; the rest match outcomes.horizon. */
export const SCORE_HORIZONS = ["all", "1d", "1w", "1m", "3m", "6m", "1y"] as const;

/** Market regimes the scorer tags regime-aware scores with. */
export const REGIME_TAGS = ["bull", "bear", "high_vol", "low_vol", "rotation"] as const;

/** Score metrics where lower is better; leaderboards rank them ascending. */
export const LOWER_IS_BETTER_METRICS: readonly string[] = [
  "calibration_brier",
  "max_drawdown",
];

export const BPS_PER_PERCENT = 100;
export const CENTS_PER_DOLLAR = 100;
