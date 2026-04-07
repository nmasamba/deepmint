import {
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export interface LearnModule {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  sections: {
    title: string;
    content: string;
  }[];
  quiz?: {
    question: string;
    options: string[];
    correctIndex: number;
  }[];
}

export const LEARN_MODULES: LearnModule[] = [
  {
    id: "what-makes-a-good-trade",
    title: "What Makes a Good Trade?",
    description:
      "Learn about risk/reward ratios, position sizing, and why raw returns can be misleading.",
    icon: TrendingUp,
    estimatedMinutes: 10,
    difficulty: "beginner",
    sections: [
      {
        title: "Return vs Risk-Adjusted Return",
        content: `Most people judge traders by their raw returns. "They made 50% last year!" But that number alone is meaningless without understanding the risk taken to achieve it.

**Example:**
- **Trader A**: 50% return, but had a 40% drawdown along the way. They nearly lost half their portfolio before recovering.
- **Trader B**: 20% return, with only a 5% max drawdown. Steady, consistent growth.

Which is better? Trader B is almost certainly the more skilled trader. Their risk-adjusted returns (return per unit of risk) are far superior.

On Deepmint, we measure this with the **Sharpe Ratio** — the return above the risk-free rate, divided by volatility. Higher is better.`,
      },
      {
        title: "Position Sizing",
        content: `Position sizing is how much of your portfolio you allocate to a single trade. It's arguably more important than the trade idea itself.

**The 2% Rule**: Many professional traders never risk more than 2% of their portfolio on a single position. This means even a string of losing trades won't wipe them out.

**Why it matters on Deepmint**: When you create a paper portfolio, pay attention to how much of your virtual capital goes into each trade. Diversification across positions reduces the impact of any single bad call.`,
      },
      {
        title: "The Kelly Criterion",
        content: `The Kelly Criterion is a formula that tells you the optimal bet size based on your edge and the odds:

**Kelly % = (Win Probability × Win/Loss Ratio - Loss Probability) / Win/Loss Ratio**

In practice, most traders use "half Kelly" — betting half of what the formula suggests — because real-world uncertainty makes the optimal bet smaller than the theoretical one.

The key insight: even with a genuine edge, betting too large will eventually lead to ruin. Size matters.`,
      },
    ],
    quiz: [
      {
        question:
          "Trader A returns 50% with 40% max drawdown. Trader B returns 20% with 5% max drawdown. Who has better risk-adjusted returns?",
        options: ["Trader A", "Trader B", "They're equal"],
        correctIndex: 1,
      },
      {
        question:
          "What does the 2% rule suggest about position sizing?",
        options: [
          "Never have more than 2 positions",
          "Never risk more than 2% of portfolio on one trade",
          "Always allocate exactly 2% to each trade",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "reading-a-track-record",
    title: "Reading a Track Record",
    description:
      "Understand Sharpe ratio, Calmar ratio, max drawdown, win rate, and what they tell you about a trader.",
    icon: BarChart3,
    estimatedMinutes: 12,
    difficulty: "beginner",
    sections: [
      {
        title: "Sharpe Ratio",
        content: `The **Sharpe Ratio** measures return per unit of risk (volatility).

**Formula**: (Portfolio Return - Risk-Free Rate) / Standard Deviation of Returns

- **< 1.0**: Below average
- **1.0 - 2.0**: Good
- **2.0 - 3.0**: Excellent
- **> 3.0**: Exceptional (and rare over long periods)

On Deepmint, Player profiles show their annualized Sharpe ratio. Higher means more consistent risk-adjusted returns.`,
      },
      {
        title: "Max Drawdown & Calmar Ratio",
        content: `**Max Drawdown** is the largest peak-to-trough decline in portfolio value. It answers: "What's the worst it ever got?"

The **Calmar Ratio** = Annualized Return / Max Drawdown. It tells you how much return you're getting per unit of downside pain.

- A Calmar of 2.0 means you earned twice your worst drawdown.
- A Calmar below 1.0 means your worst drawdown exceeded your annual return — concerning.

Both metrics are shown on Deepmint Player profiles.`,
      },
      {
        title: "Win Rate vs Expected Value",
        content: `Win rate alone is misleading. A trader could win 90% of trades but still lose money if their losses are much larger than their wins.

**Expected Value** = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)

A trader with a 40% win rate can be highly profitable if their wins are 3x their losses:
- EV = (0.40 × 3) - (0.60 × 1) = 1.20 - 0.60 = +0.60 per unit risked

On Deepmint, Guide profiles show **hit rate** alongside **average return** to give the full picture.`,
      },
    ],
    quiz: [
      {
        question: "A Sharpe ratio of 2.5 would be considered:",
        options: ["Below average", "Average", "Excellent"],
        correctIndex: 2,
      },
      {
        question:
          "A trader wins 40% of trades with 3:1 win/loss ratio. Is their expected value positive?",
        options: ["Yes", "No", "Can't tell"],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "why-predictions-need-horizons",
    title: "Why Predictions Need Horizons",
    description:
      "Understand why time horizons matter and how the same analyst can have different accuracy at different timeframes.",
    icon: Clock,
    estimatedMinutes: 8,
    difficulty: "beginner",
    sections: [
      {
        title: "The Problem with Open-Ended Predictions",
        content: `"Apple will go up."

When? By how much? Without a time horizon, this prediction is unfalsifiable — and therefore useless.

On Deepmint, every claim must include a **horizon**: 1 day, 1 week, 1 month, 3 months, 6 months, or 1 year. When the horizon expires, the prediction is evaluated against actual market data. No ambiguity.`,
      },
      {
        title: "Different Skills at Different Horizons",
        content: `A guide might have an 80% hit rate on 1-year calls but only 45% on 1-week calls. Why?

- **Short-term** accuracy requires understanding market microstructure, momentum, and sentiment flows.
- **Long-term** accuracy requires fundamental analysis, understanding business models, and patience.

These are different skills. Deepmint tracks hit rates at each horizon separately, so you can identify who's actually good at what timeframe.`,
      },
      {
        title: "Horizon and Risk",
        content: `Longer horizons generally mean more uncertainty but also more potential for fundamental value to be realized.

A 1-day prediction on a stock is essentially a bet on short-term momentum. A 1-year prediction is a bet on the business.

When following Guides on Deepmint, pay attention to which horizon they specialize in. If you're a long-term investor, a guide who's great at 1-day calls may not be relevant to you.`,
      },
    ],
  },
  {
    id: "confidence-calibration-trap",
    title: "The Confidence Calibration Trap",
    description:
      "Learn about overconfidence, Brier scores, and why knowing what you don't know is a superpower.",
    icon: Target,
    estimatedMinutes: 10,
    difficulty: "intermediate",
    sections: [
      {
        title: "What is Calibration?",
        content: `Calibration measures how well your stated confidence matches reality.

If you say you're 70% confident about 10 predictions, and 7 of them turn out correct — you're perfectly calibrated.

Most people are **overconfident**: they say 90% when they should say 65%. This is one of the most robust findings in behavioral psychology.`,
      },
      {
        title: "The Brier Score",
        content: `The **Brier Score** quantifies calibration. It's the mean squared error between your confidence and the actual outcome:

**Brier Score** = Average of (confidence - outcome)^2

- **0.0** = Perfect (you always said 100% for correct and 0% for incorrect)
- **0.25** = Random guessing at 50%
- **> 0.25** = Worse than random

Lower is better. On Deepmint, Guides who submit confidence levels have their Brier scores tracked over time.`,
      },
      {
        title: "Why Calibration Beats Confidence",
        content: `A guide who says "I'm 60% sure AAPL goes up" and is right 60% of the time is more valuable than one who says "I'm 95% sure" and is right 70% of the time.

Why? Because the calibrated guide gives you useful **probability information** you can use for position sizing. The overconfident one gives you misleading signals.

On Deepmint, well-calibrated Guides earn higher **Expected Information Value (EIV)** scores, even if their raw hit rate is lower.`,
      },
    ],
    quiz: [
      {
        question:
          "If you rate 10 predictions at 80% confidence and 6 are correct, you are:",
        options: ["Well-calibrated", "Overconfident", "Underconfident"],
        correctIndex: 1,
      },
      {
        question: "A Brier score of 0.15 indicates:",
        options: [
          "Poor calibration",
          "Better than random calibration",
          "Worse than random",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "paper-trading-first-portfolio",
    title: "Paper Trading Your First Portfolio",
    description:
      "Step-by-step guide to creating a paper portfolio on Deepmint and making your first virtual trades.",
    icon: BookOpen,
    estimatedMinutes: 5,
    difficulty: "beginner",
    sections: [
      {
        title: "What is Paper Trading?",
        content: `Paper trading lets you practice buying and selling stocks with virtual money. It's risk-free — you can't lose real money — but it gives you a realistic experience of:

- Deciding when to enter and exit positions
- Managing a portfolio with limited capital
- Tracking your performance over time

On Deepmint, paper portfolios start with $100,000 in virtual cash.`,
      },
      {
        title: "Creating Your First Portfolio",
        content: `1. Navigate to **Paper Portfolio** in the sidebar
2. Click **New Portfolio**
3. Give it a name (e.g., "My First Portfolio")
4. You'll start with $100,000 virtual cash

That's it! You're ready to start trading.`,
      },
      {
        title: "Making Your First Trade",
        content: `1. In your portfolio, click **New Trade**
2. Search for a Mag 7 ticker (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA)
3. Choose **Buy** or **Sell**
4. Enter the number of shares
5. Submit — the trade executes at the current market price

To close a position later, click the **Close** button next to any open trade. The P&L is calculated automatically.

Track your performance with the equity curve chart and the summary metrics at the top of your portfolio.`,
      },
    ],
  },
];
