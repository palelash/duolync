"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, Wifi, Megaphone, MessageSquare, PartyPopper, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMyApplicationsAction } from "@/app/actions/creator-campaigns";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingStep {
  id: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  cta: string;
  href: string;
  done: boolean;
  accentColor: string;
}

interface OnboardingChecklistProps {
  userId: string;
  hasConnectedPlatform: boolean;
}

// ── Storage key ───────────────────────────────────────────────────────────────

function storageKey(userId: string) {
  return `duolync_onboarding_dismissed_${userId}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingChecklist({
  userId,
  hasConnectedPlatform,
}: OnboardingChecklistProps) {
  const { recentConversations } = useMessaging();

  // True only when a brand actually sent a message to this creator
  // (lastMessageSenderId is the brand's id, not the creator's own id)
  const hasMessageFromBrand = recentConversations.some(
    (c) =>
      c.otherUserType === "brand" &&
      c.lastMessageSenderId !== null &&
      c.lastMessageSenderId !== userId,
  );

  const [hasApplied, setHasApplied] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [celebrating, setCelebrating] = useState(false);
  const [prevAllDone, setPrevAllDone] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Hydrate dismiss state from localStorage
  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey(userId)) === "1";
    setDismissed(isDismissed);
    setLoaded(true);
  }, [userId]);

  // Check if the creator has at least one campaign application
  const loadApplicationCount = useCallback(async () => {
    const result = await getMyApplicationsAction();
    if (!result.error && result.data.length > 0) {
      setHasApplied(true);
    }
  }, []);

  useEffect(() => {
    if (!dismissed) {
      loadApplicationCount();
    }
  }, [dismissed, loadApplicationCount]);

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      icon: Wifi,
      title: "Connect a social account",
      description: "Link Instagram, TikTok, or YouTube so brands can see your reach.",
      cta: "Connect now",
      href: "/creator/presence",
      done: hasConnectedPlatform,
      accentColor: "#c084fc",
    },
    {
      id: "apply",
      icon: Megaphone,
      title: "Apply to your first campaign",
      description: "Browse open campaigns and send your first collaboration proposal.",
      cta: "Browse campaigns",
      href: "/creator/campaigns",
      done: hasApplied,
      accentColor: "#f472b6",
    },
    {
      id: "message",
      icon: MessageSquare,
      title: "Get a message from a brand",
      description: "Once brands find you, they'll reach out here. You can also start the conversation.",
      cta: "Open messages",
      href: "/messages",
      done: hasMessageFromBrand,
      accentColor: "#67e8f9",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  // Trigger celebration when all steps newly complete
  useEffect(() => {
    if (allDone && !prevAllDone && loaded && !dismissed) {
      setCelebrating(true);
      const t = setTimeout(() => {
        setCelebrating(false);
        setDismissed(true);
        localStorage.setItem(storageKey(userId), "1");
      }, 2800);
      return () => clearTimeout(t);
    }
    setPrevAllDone(allDone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, loaded, dismissed, userId]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(storageKey(userId), "1");
  };

  // Don't render until localStorage is hydrated, or if dismissed
  if (!loaded || dismissed) return null;

  return (
    <div
      className={cn(
        "mb-8 rounded-3xl overflow-hidden transition-all duration-500",
        "border border-white/[0.07]",
        "bg-white/[0.03] backdrop-blur-xl",
      )}
    >
      {/* Purple top accent strip */}
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(90deg, #c084fc 0%, #f472b6 50%, #67e8f9 100%)" }}
      />

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-display font-bold text-base text-zinc-100">
              Get started with Duolync
            </h3>
            {/* Step badge */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/15">
              {completedCount}/{steps.length} done
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Complete these 3 steps to unlock your full creator profile.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          title="Dismiss"
          aria-label="Dismiss onboarding"
          className="shrink-0 ml-3 p-1.5 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, #c084fc 0%, #f472b6 60%, #67e8f9 100%)",
            }}
          />
        </div>
      </div>

      {/* Celebration overlay */}
      {celebrating && (
        <div className="px-5 pb-5">
          <div
            className="rounded-xl px-5 py-4 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, rgba(192,132,252,0.12), rgba(103,232,249,0.08))", border: "1px solid rgba(192,132,252,0.2)" }}
          >
            <PartyPopper className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                You&apos;re all set! Welcome to Duolync.
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Your creator profile is now fully activated.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Steps */}
      {!celebrating && (
        <div className="px-5 pb-5 space-y-2">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isNext = !step.done && steps.slice(0, index).every((s) => s.done);

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-4 rounded-2xl px-4 py-3 transition-all duration-200",
                  step.done
                    ? "bg-emerald-500/[0.05] border border-emerald-500/[0.12]"
                    : isNext
                      ? "bg-white/[0.04] border border-white/[0.10] shadow-sm"
                      : "bg-white/[0.02] border border-white/[0.05]",
                )}
              >
                {/* Step status icon */}
                <div className="shrink-0">
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Circle
                      className="w-5 h-5"
                      style={{ color: isNext ? step.accentColor : "#71717a" }}
                    />
                  )}
                </div>

                {/* Platform icon circle */}
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: step.done
                      ? "rgba(34,197,94,0.1)"
                      : `${step.accentColor}18`,
                    border: `1px solid ${step.done ? "rgba(34,197,94,0.2)" : `${step.accentColor}30`}`,
                  }}
                >
                  <StepIcon
                    className="w-4 h-4"
                    style={{ color: step.done ? "#22c55e" : step.accentColor }}
                  />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold leading-tight",
                      step.done
                        ? "text-zinc-600 line-through"
                        : "text-zinc-100",
                    )}
                  >
                    {step.title}
                  </p>
                  {!step.done && (
                    <p className="text-xs text-zinc-500 mt-0.5 leading-snug line-clamp-1">
                      {step.description}
                    </p>
                  )}
                </div>

                {/* CTA */}
                {!step.done && (
                  <Link
                    href={step.href}
                    className={cn(
                      "shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap",
                      isNext
                        ? "text-white"
                        : "text-zinc-400 bg-white/[0.06] hover:bg-white/[0.10]",
                    )}
                    style={
                      isNext
                        ? { background: step.accentColor, boxShadow: `0 0 16px ${step.accentColor}35` }
                        : undefined
                    }
                  >
                    {step.cta}
                    <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
