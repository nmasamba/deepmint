import { SourceAdapter, type RawCapture } from "./base";

/**
 * Demo source adapter with hardcoded analyst reports for testing.
 * Each report contains an explicit prediction about a Mag 7 stock.
 */
export class DemoSourceAdapter extends SourceAdapter {
  readonly name = "demo";

  private readonly guideEntityId: string;

  constructor(guideEntityId: string) {
    super();
    this.guideEntityId = guideEntityId;
  }

  async fetchLatest(): Promise<RawCapture[]> {
    const now = new Date();

    return [
      {
        entityId: this.guideEntityId,
        sourceUrl: "https://demo.deepmint.com/reports/aapl-q1-2026",
        rawText: `After reviewing Apple's Q1 2026 earnings, we maintain our long position on AAPL with a 12-month price target of $245. Strong services revenue growth of 18% YoY and the iPhone 17 cycle entering its peak quarter support our bullish outlook. We have high conviction in this call.`,
        capturedAt: new Date(now.getTime() - 60000), // 1 min ago
      },
      {
        entityId: this.guideEntityId,
        sourceUrl: "https://demo.deepmint.com/reports/tsla-delivery-miss",
        rawText: `Tesla's Q1 deliveries came in 15% below consensus at 425k units. We are initiating a short position on TSLA with a 90-day horizon. Price target $180. The competitive landscape in China continues to deteriorate, and we see margin pressure intensifying through Q3. This is a speculative position given Elon's unpredictability.`,
        capturedAt: new Date(now.getTime() - 120000), // 2 min ago
      },
      {
        entityId: this.guideEntityId,
        sourceUrl: "https://demo.deepmint.com/reports/nvda-ai-capex",
        rawText: `NVIDIA remains our top pick in semiconductors. We're long NVDA with a $1,200 target over the next 6 months (180 days). Hyperscaler AI capex is accelerating, and Blackwell demand visibility extends into Q1 2027. The earnings momentum story is intact. High conviction call driven by our analysis of data center buildout timelines.`,
        capturedAt: new Date(now.getTime() - 180000), // 3 min ago
      },
      {
        entityId: this.guideEntityId,
        sourceUrl: "https://demo.deepmint.com/reports/meta-reels-monetization",
        rawText: `Meta Platforms is executing well on Reels monetization. We expect META to outperform over the next 30 days as the Q2 ad revenue guidance lands well above street estimates. Our short-term long thesis is supported by improving engagement metrics and new ad formats. Target $580.`,
        capturedAt: new Date(now.getTime() - 240000), // 4 min ago
      },
      {
        entityId: this.guideEntityId,
        sourceUrl: "https://demo.deepmint.com/reports/msft-cloud-neutral",
        rawText: `We are taking a neutral stance on Microsoft for the next 90 days. Azure growth is decelerating but the Copilot revenue contribution is ramping. These forces roughly offset. MSFT is fairly valued at current levels around $420. We recommend waiting for a better entry point rather than initiating new positions.`,
        capturedAt: new Date(now.getTime() - 300000), // 5 min ago
      },
    ];
  }
}
