"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/_components/layout/Navbar";
import Footer from "@/app/_components/layout/Footer";
import { HeroSection } from "@/app/_components/home/HeroSection";
import { FeaturesSection } from "@/app/_components/home/FeaturesSection";
import { BentoSection } from "@/app/_components/home/BentoSection";
import { SearchSection } from "@/app/_components/home/SearchSection";
import { OutreachSection } from "@/app/_components/home/OutreachSection";
import { CRMSection } from "@/app/_components/home/CRMSection";
import { ToolsSection } from "@/app/_components/home/ToolsSection";
import { FAQSection } from "@/app/_components/home/FAQSection";
import { FinalCTASection } from "@/app/_components/home/FinalCTASection";
import { useAuth } from "@/hooks/useAuth";
import { hasCompletedOnboarding } from "@/lib/onboarding";
import { AuthHoldScreen } from "@/app/_components/auth/AuthHoldScreen";

export default function Page() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  // Start blocked: prevents the landing page from ever painting for authenticated users.
  // Flips to false only after we confirm there is no active session.
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (user && profile) {
      const target = hasCompletedOnboarding(user.id)
        ? profile.user_type === "brand"
          ? "/brand/dashboard"
          : "/creator/dashboard"
        : "/onboarding";
      router.replace(target);
      // Leave isCheckingAuth = true so the dark screen holds while the
      // router navigates. The landing page will never render.
      return;
    }

    // No session confirmed — safe to show the public landing page.
    setIsCheckingAuth(false);
  }, [user, profile, loading, router]);

  // Full-screen hold — never paint the landing tree until the session
  // check finishes, so hook order stays stable across hydration.
  if (isCheckingAuth) {
    return <AuthHoldScreen />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      {/* Navbar — fixed dark overlay */}
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "var(--bg-navbar)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <Navbar />
      </div>

      <main>
        <HeroSection />
        <FeaturesSection />
        <BentoSection />
        <SearchSection />
        <OutreachSection />
        <CRMSection />
        <ToolsSection />
        <FAQSection />
        <FinalCTASection />
      </main>

      <div style={{ background: "var(--bg-footer)", borderTop: "1px solid var(--border-card)" }}>
        <Footer />
      </div>
    </div>
  );
}
