interface TickerPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function TickerPage({ params }: TickerPageProps) {
  const { symbol } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary font-mono">
        {symbol.toUpperCase()}
      </h1>
      <p className="mt-2 text-text-secondary">
        Ticker detail page with consensus signals, top analysts, and recent claims.
      </p>
    </div>
  );
}
