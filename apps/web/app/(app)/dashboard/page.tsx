"use client";

import { SubmitClaimForm } from "@/components/claims/SubmitClaimForm";
import { ClaimsTimeline } from "@/components/claims/ClaimsTimeline";
import { Mag7Grid } from "@/components/dashboard/Mag7Grid";
import { SocialFeed } from "@/components/dashboard/SocialFeed";
import { WatchlistSidebar } from "@/components/dashboard/WatchlistSidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      {/* Main column */}
      <div className="space-y-8">
        {/* Hero CTA */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
            <p className="mt-1 text-text-secondary">
              AI-curated predictions and analyst signals.
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

        {/* Mag 7 Consensus Grid */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            AI Consensus — Mag 7
          </h2>
          <Mag7Grid />
        </div>

        {/* Feed Tabs: Following / All */}
        <Tabs defaultValue="following">
          <div className="flex items-center justify-between">
            <TabsList className="bg-bg-secondary">
              <TabsTrigger value="following">Following</TabsTrigger>
              <TabsTrigger value="all">All Claims</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="following" className="mt-4">
            <SocialFeed />
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <ClaimsTimeline />
          </TabsContent>
        </Tabs>
      </div>

      {/* Sidebar */}
      <aside className="space-y-6">
        <WatchlistSidebar />
      </aside>
    </div>
  );
}
