import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ChoosePath } from "@/components/landing/ChoosePath";
import { SocialProof } from "@/components/landing/SocialProof";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <LandingNavbar />
      <HeroSection />
      <HowItWorks />
      <ChoosePath />
      <SocialProof />
      <Footer />
    </main>
  );
}
