"use client";

import { useState } from "react";
import { PortfolioList } from "@/components/paper/PortfolioList";
import { PortfolioDetail } from "@/components/paper/PortfolioDetail";

export default function PaperPortfolioPage() {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Paper Portfolio
        </h1>
        <p className="mt-1 text-text-secondary">
          Practice trading with virtual money. AI tracks and scores your performance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Portfolio sidebar */}
        <div>
          <PortfolioList
            onSelect={setSelectedPortfolioId}
            selectedId={selectedPortfolioId}
          />
        </div>

        {/* Portfolio detail */}
        <div>
          {selectedPortfolioId ? (
            <PortfolioDetail portfolioId={selectedPortfolioId} />
          ) : (
            <div className="rounded-lg border border-border bg-bg-secondary p-12 text-center">
              <p className="text-text-secondary">
                Select a portfolio to view details, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
