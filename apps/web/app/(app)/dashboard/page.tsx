"use client";

import { SubmitClaimForm } from "@/components/claims/SubmitClaimForm";
import { ClaimsTimeline } from "@/components/claims/ClaimsTimeline";
import { Button } from "@/components/ui/button";
import { Target } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Hero CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-text-secondary">
            Recent predictions from the community.
          </p>
        </div>
        <SubmitClaimForm
          trigger={
            <Button className="bg-accent text-bg-primary hover:bg-accent/90">
              <Target className="mr-2 h-4 w-4" />
              Make a Prediction
            </Button>
          }
        />
      </div>

      {/* Recent Claims Feed */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          Recent Claims
        </h2>
        <ClaimsTimeline />
      </div>
    </div>
  );
}
