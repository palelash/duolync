"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  X,
  Building2,
  Megaphone,
  Search,
  Send,
  PartyPopper,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandOnboardingStep {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  cta: string;
  href: string;
  done: boolean;
  accentColor: string;
}

interface BrandOnboardingChecklistProps {
  userId: string;
  hasCompletedProfile: boolean;
  hasCampaigns: boolean;
  hasSavedCreators: boolean;
  hasSentProposals: boolean;
}

function storageKey(userId: string) {
  return `duolync_brand_onboarding_dismissed_${userId}`;
}

export function BrandOnboardingChecklist({
  userId,
  hasCompletedProfile,
  hasCampaigns,
  hasSavedCreators,
  hasSentProposals,
}: BrandOnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const [prevAllDone, setPrevAllDone] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey(userId)) === "1";
    setDismissed(isDismissed);
    setLoaded(true);
  }, [userId]);

  const steps: BrandOnboardingStep[] = [
    {
      id: "profile",
      icon: Building2,
      title: "Complete your brand profile",
      description: "Add your company name, logo, website, and industry.",
      cta: "Edit profile",
      href: "/brand/settings",
      done: hasCompletedProfile,
      accentColor: "text-cyan-500",
    },
    {
      id: "campaign",
      icon: Megaphone,
      title: "Create your first campaign",
      description: "Define your goals, budget, and content brief for creators.",
      cta: "Create campaign",
      href: "/brand/campaigns",
      done: hasCampaigns,
      accentColor: "text-violet-500",
    },
    {
      id: "discover",
      icon: Search,
      title: "Discover and save a creator",
      description: "Browse our network and shortlist creators that fit your brand.",
      cta: "Browse creators",
      href: "/brand/discover",
      done: hasSavedCreators,
      accentColor: "text-pink-500",
    },
    {
      id: "proposal",
      icon: Send,
      title: "Send your first proposal",
      description: "Invite a creator to collaborate on your campaign.",
      cta: "View proposals",
      href: "/brand/proposals",
      done: hasSentProposals,
      accentColor: "text-emerald-500",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const progressPct = Math.round((doneCount / steps.length) * 100);

  // Celebrate when checklist is newly completed
  useEffect(() => {
    if (allDone && !prevAllDone && loaded) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 3500);
      setPrevAllDone(true);
      return () => clearTimeout(t);
    }
    if (!allDone) setPrevAllDone(false);
  }, [allDone, prevAllDone, loaded]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(storageKey(userId), "1");
  };

  if (!loaded || dismissed) return null;

  return (
    <div className="mb-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-5">
        {/* Ambient gradient */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top left, rgba(6,182,212,0.06) 0%, transparent 60%)",
          }}
        />

        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center shrink-0">
              {allDone ? (
                <PartyPopper className="w-4 h-4 text-cyan-400" strokeWidth={1.5} />
              ) : (
                <Building2 className="w-4 h-4 text-cyan-400" strokeWidth={1.5} />
              )}
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-zinc-100">
                {allDone ? "You're all set! 🎉" : "Get your brand ready"}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {allDone
                  ? "Your brand profile is complete. Start running campaigns!"
                  : `${doneCount} of ${steps.length} steps complete`}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors shrink-0 mt-0.5"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Progress bar */}
        {!allDone && (
          <div className="relative mb-4">
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="absolute right-0 -top-4.5 text-[10px] font-medium text-zinc-500">
              {progressPct}%
            </span>
          </div>
        )}

        {/* Steps */}
        {!allDone && (
          <div className="relative space-y-1">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.id}
                  href={step.done ? "#" : step.href}
                  onClick={(e) => step.done && e.preventDefault()}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-2xl transition-all group",
                    step.done
                      ? "opacity-40 cursor-default"
                      : "hover:bg-white/[0.05] cursor-pointer",
                  )}
                >
                  {/* Check circle */}
                  <div className="shrink-0">
                    {step.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" strokeWidth={1.5} />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-700" strokeWidth={1.5} />
                    )}
                  </div>

                  {/* Icon */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                      step.done
                        ? "bg-white/[0.03] border-white/[0.06]"
                        : "bg-white/[0.05] border-white/[0.08]",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        step.done ? "text-zinc-600" : step.accentColor,
                      )}
                      strokeWidth={1.5}
                    />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium leading-none mb-0.5",
                        step.done
                          ? "line-through text-zinc-600"
                          : "text-zinc-100",
                      )}
                    >
                      {step.title}
                    </p>
                    {!step.done && (
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {step.description}
                      </p>
                    )}
                  </div>

                  {/* CTA arrow */}
                  {!step.done && (
                    <div className="shrink-0 flex items-center gap-1 text-xs font-medium text-zinc-500 group-hover:text-zinc-200 transition-colors">
                      <span className="hidden sm:inline">{step.cta}</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" strokeWidth={1.5} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Celebration state */}
        {allDone && celebrating && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <PartyPopper className="w-8 h-8 text-cyan-400" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-zinc-100">
              Your brand is ready to go!
            </p>
            <Link
              href="/brand/campaigns"
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline"
            >
              Go to campaigns
              <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
