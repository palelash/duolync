"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CTAProps {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

interface Tip {
  icon: ReactNode;
  label: string;
}

interface RichEmptyStateProps {
  icon: ReactNode;
  headline: string;
  sub: string;
  primary?: CTAProps;
  secondary?: CTAProps;
  tips?: Tip[];
  ambient?: "purple" | "pink" | "cyan";
  className?: string;
}

const AMBIENT = {
  purple: {
    glow: "rgba(139,92,246,0.14)",
    ring: "border-violet-200/70 dark:border-violet-500/20",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  pink: {
    glow: "rgba(236,72,153,0.12)",
    ring: "border-pink-200/70 dark:border-pink-500/20",
    bg: "bg-pink-50 dark:bg-pink-500/10",
  },
  cyan: {
    glow: "rgba(139,92,246,0.14)",
    ring: "border-violet-200/70 dark:border-violet-500/20",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
};

export function RichEmptyState({
  icon,
  headline,
  sub,
  primary,
  secondary,
  tips,
  ambient = "purple",
  className,
}: RichEmptyStateProps) {
  const { glow, ring, bg } = AMBIENT[ambient];

  const renderPrimary = primary ? (
    primary.href ? (
      <Link href={primary.href}>
        <Button className="btn-gradient rounded-xl gap-2 px-6">
          {primary.icon}
          {primary.label}
        </Button>
      </Link>
    ) : (
      <Button className="btn-gradient rounded-xl gap-2 px-6" onClick={primary.onClick}>
        {primary.icon}
        {primary.label}
      </Button>
    )
  ) : null;

  const renderSecondary = secondary ? (
    secondary.href ? (
      <Link
        href={secondary.href}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        {secondary.label}
      </Link>
    ) : (
      <button
        onClick={secondary.onClick}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        {secondary.label}
      </button>
    )
  ) : null;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center text-center py-20 px-6 overflow-hidden",
        className,
      )}
    >
      {/* Ambient glow + dot grid */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[110px]"
          style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--dot-grid) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Concentric ring icon */}
      <div className="relative z-10 flex items-center justify-center w-40 h-40 mb-6">
        <div className={cn("absolute w-40 h-40 rounded-[28px] border opacity-25", ring)} />
        <div className={cn("absolute w-[120px] h-[120px] rounded-3xl border opacity-50", ring)} />
        <div
          className={cn(
            "w-20 h-20 rounded-3xl flex items-center justify-center border",
            bg,
            ring,
          )}
        >
          {icon}
        </div>
      </div>

      <h3 className="relative z-10 font-display text-xl font-bold mb-2 text-zinc-900 dark:text-zinc-50">
        {headline}
      </h3>
      <p className="relative z-10 text-muted-foreground text-sm max-w-[300px] leading-relaxed mb-7">
        {sub}
      </p>

      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 mb-8">
        {renderPrimary}
        {renderSecondary}
      </div>

      {tips && tips.length > 0 && (
        <div className="relative z-10 flex flex-wrap justify-center gap-2">
          {tips.map((tip, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
            >
              {tip.icon}
              {tip.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
