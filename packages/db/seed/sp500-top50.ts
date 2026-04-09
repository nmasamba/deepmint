/**
 * S&P 500 Top 50 seed data (Phase 1 expansion beyond Mag 7).
 *
 * The Mag 7 (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA) are already seeded
 * by the main seed.ts. This file contains the additional ~43 tickers that
 * bring total active instruments to ~50.
 *
 * Market cap buckets:
 *   mega:  > $200B
 *   large: $10B - $200B
 *   mid:   $2B - $10B
 *
 * All tickers are on NYSE or NASDAQ, asset class = equity.
 */

export interface SeedInstrument {
  ticker: string;
  name: string;
  exchange: "NYSE" | "NASDAQ" | "AMEX";
  sector: string;
  industry: string;
  marketCapBucket: "mega" | "large" | "mid" | "small" | "micro";
}

export const SP500_TOP_50_EXPANSION: SeedInstrument[] = [
  // Financials
  { ticker: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", sector: "Financial Services", industry: "Banks—Diversified", marketCapBucket: "mega" },
  { ticker: "V", name: "Visa Inc.", exchange: "NYSE", sector: "Financial Services", industry: "Credit Services", marketCapBucket: "mega" },
  { ticker: "MA", name: "Mastercard Incorporated", exchange: "NYSE", sector: "Financial Services", industry: "Credit Services", marketCapBucket: "mega" },
  { ticker: "BAC", name: "Bank of America Corporation", exchange: "NYSE", sector: "Financial Services", industry: "Banks—Diversified", marketCapBucket: "mega" },
  { ticker: "WFC", name: "Wells Fargo & Company", exchange: "NYSE", sector: "Financial Services", industry: "Banks—Diversified", marketCapBucket: "large" },
  { ticker: "MS", name: "Morgan Stanley", exchange: "NYSE", sector: "Financial Services", industry: "Capital Markets", marketCapBucket: "large" },
  { ticker: "GS", name: "The Goldman Sachs Group, Inc.", exchange: "NYSE", sector: "Financial Services", industry: "Capital Markets", marketCapBucket: "large" },
  { ticker: "BLK", name: "BlackRock, Inc.", exchange: "NYSE", sector: "Financial Services", industry: "Asset Management", marketCapBucket: "large" },
  { ticker: "SCHW", name: "The Charles Schwab Corporation", exchange: "NYSE", sector: "Financial Services", industry: "Capital Markets", marketCapBucket: "large" },

  // Healthcare
  { ticker: "LLY", name: "Eli Lilly and Company", exchange: "NYSE", sector: "Healthcare", industry: "Drug Manufacturers—General", marketCapBucket: "mega" },
  { ticker: "UNH", name: "UnitedHealth Group Incorporated", exchange: "NYSE", sector: "Healthcare", industry: "Healthcare Plans", marketCapBucket: "mega" },
  { ticker: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", sector: "Healthcare", industry: "Drug Manufacturers—General", marketCapBucket: "mega" },
  { ticker: "MRK", name: "Merck & Co., Inc.", exchange: "NYSE", sector: "Healthcare", industry: "Drug Manufacturers—General", marketCapBucket: "mega" },
  { ticker: "ABBV", name: "AbbVie Inc.", exchange: "NYSE", sector: "Healthcare", industry: "Drug Manufacturers—General", marketCapBucket: "mega" },
  { ticker: "TMO", name: "Thermo Fisher Scientific Inc.", exchange: "NYSE", sector: "Healthcare", industry: "Diagnostics & Research", marketCapBucket: "large" },
  { ticker: "ABT", name: "Abbott Laboratories", exchange: "NYSE", sector: "Healthcare", industry: "Medical Devices", marketCapBucket: "large" },
  { ticker: "DHR", name: "Danaher Corporation", exchange: "NYSE", sector: "Healthcare", industry: "Diagnostics & Research", marketCapBucket: "large" },
  { ticker: "PFE", name: "Pfizer Inc.", exchange: "NYSE", sector: "Healthcare", industry: "Drug Manufacturers—General", marketCapBucket: "large" },
  { ticker: "ISRG", name: "Intuitive Surgical, Inc.", exchange: "NASDAQ", sector: "Healthcare", industry: "Medical Devices", marketCapBucket: "large" },

  // Consumer Staples
  { ticker: "PG", name: "The Procter & Gamble Company", exchange: "NYSE", sector: "Consumer Defensive", industry: "Household & Personal Products", marketCapBucket: "mega" },
  { ticker: "KO", name: "The Coca-Cola Company", exchange: "NYSE", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCapBucket: "mega" },
  { ticker: "PEP", name: "PepsiCo, Inc.", exchange: "NASDAQ", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCapBucket: "mega" },
  { ticker: "WMT", name: "Walmart Inc.", exchange: "NYSE", sector: "Consumer Defensive", industry: "Discount Stores", marketCapBucket: "mega" },
  { ticker: "COST", name: "Costco Wholesale Corporation", exchange: "NASDAQ", sector: "Consumer Defensive", industry: "Discount Stores", marketCapBucket: "mega" },
  { ticker: "PM", name: "Philip Morris International Inc.", exchange: "NYSE", sector: "Consumer Defensive", industry: "Tobacco", marketCapBucket: "large" },

  // Consumer Discretionary
  { ticker: "HD", name: "The Home Depot, Inc.", exchange: "NYSE", sector: "Consumer Cyclical", industry: "Home Improvement Retail", marketCapBucket: "mega" },
  { ticker: "MCD", name: "McDonald's Corporation", exchange: "NYSE", sector: "Consumer Cyclical", industry: "Restaurants", marketCapBucket: "mega" },
  { ticker: "NKE", name: "NIKE, Inc.", exchange: "NYSE", sector: "Consumer Cyclical", industry: "Footwear & Accessories", marketCapBucket: "large" },
  { ticker: "LOW", name: "Lowe's Companies, Inc.", exchange: "NYSE", sector: "Consumer Cyclical", industry: "Home Improvement Retail", marketCapBucket: "large" },
  { ticker: "BKNG", name: "Booking Holdings Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical", industry: "Travel Services", marketCapBucket: "large" },

  // Technology
  { ticker: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCapBucket: "mega" },
  { ticker: "ORCL", name: "Oracle Corporation", exchange: "NYSE", sector: "Technology", industry: "Software—Infrastructure", marketCapBucket: "mega" },
  { ticker: "CSCO", name: "Cisco Systems, Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Communication Equipment", marketCapBucket: "large" },
  { ticker: "ADBE", name: "Adobe Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Software—Infrastructure", marketCapBucket: "large" },
  { ticker: "CRM", name: "Salesforce, Inc.", exchange: "NYSE", sector: "Technology", industry: "Software—Application", marketCapBucket: "large" },
  { ticker: "ACN", name: "Accenture plc", exchange: "NYSE", sector: "Technology", industry: "Information Technology Services", marketCapBucket: "large" },
  { ticker: "AMD", name: "Advanced Micro Devices, Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCapBucket: "large" },
  { ticker: "INTC", name: "Intel Corporation", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCapBucket: "large" },
  { ticker: "QCOM", name: "QUALCOMM Incorporated", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCapBucket: "large" },
  { ticker: "TXN", name: "Texas Instruments Incorporated", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCapBucket: "large" },
  { ticker: "IBM", name: "International Business Machines Corporation", exchange: "NYSE", sector: "Technology", industry: "Information Technology Services", marketCapBucket: "large" },

  // Energy
  { ticker: "XOM", name: "Exxon Mobil Corporation", exchange: "NYSE", sector: "Energy", industry: "Oil & Gas Integrated", marketCapBucket: "mega" },
  { ticker: "CVX", name: "Chevron Corporation", exchange: "NYSE", sector: "Energy", industry: "Oil & Gas Integrated", marketCapBucket: "mega" },

  // Industrials
  { ticker: "CAT", name: "Caterpillar Inc.", exchange: "NYSE", sector: "Industrials", industry: "Farm & Heavy Construction Machinery", marketCapBucket: "large" },
  { ticker: "BA", name: "The Boeing Company", exchange: "NYSE", sector: "Industrials", industry: "Aerospace & Defense", marketCapBucket: "large" },
  { ticker: "HON", name: "Honeywell International Inc.", exchange: "NASDAQ", sector: "Industrials", industry: "Specialty Industrial Machinery", marketCapBucket: "large" },
  { ticker: "UPS", name: "United Parcel Service, Inc.", exchange: "NYSE", sector: "Industrials", industry: "Integrated Freight & Logistics", marketCapBucket: "large" },
  { ticker: "RTX", name: "RTX Corporation", exchange: "NYSE", sector: "Industrials", industry: "Aerospace & Defense", marketCapBucket: "large" },

  // Communication
  { ticker: "NFLX", name: "Netflix, Inc.", exchange: "NASDAQ", sector: "Communication Services", industry: "Entertainment", marketCapBucket: "mega" },
  { ticker: "DIS", name: "The Walt Disney Company", exchange: "NYSE", sector: "Communication Services", industry: "Entertainment", marketCapBucket: "large" },
];
