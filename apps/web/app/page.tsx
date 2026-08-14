import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ChoosePath } from "@/components/landing/ChoosePath";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <LandingNavbar />
      <HeroSection />
      <HowItWorks />
      <ChoosePath />
      {/* SocialProof (live platform stats) is hidden pre-launch: with a
          near-empty ledger the numbers undermine rather than build trust.
          Re-enable by restoring the import + element once there is real
          volume to show. */}
      <Footer />
    </main>
  );
}
