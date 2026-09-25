"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import {
  Brain,
  BarChart3,
  Handshake,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CircleDollarSign,
  Zap,
  Target,
} from "lucide-react";
import {
  InstagramIcon,
  TikTokIcon,
  YouTubeIcon,
} from "@/app/_components/icons/SocialIcons";

// ── Design tokens — mirrors globals.css and BentoSection exactly ─────────────
const PURPLE = "#a78bfa";
const CYAN = "#67e8f9";
const PINK = "#f472b6";
const EMERALD = "#34d399";

const PURPLE_T = "var(--accent-violet-text)";
const CYAN_T = "var(--accent-cyan-text)";
const PINK_T = "var(--accent-pink-text)";
const EMERALD_T = "var(--accent-emerald-text)";

// ── Framer-motion variants ────────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14 } },
};

// ── Reusable pill label — same pattern as BentoSection ───────────────────────
function FeaturePill({
  icon: Icon,
  label,
  color,
  textColor,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  textColor: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
      style={{
        background: `${color}18`,
        color: textColor,
        border: `1px solid ${color}30`,
      }}
    >
      <Icon size={11} />
      {label}
    </div>
  );
}

// ── Glass card shell — enhanced hover glows over BentoSection's GlassCard ────
function FeatureCard({
  children,
  accentColor,
  className = "",
}: {
  children: React.ReactNode;
  accentColor: string;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`relative rounded-3xl p-6 overflow-hidden group transition-all duration-500 flex flex-col ${className}`}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${accentColor}28`,
        backdropFilter: "blur(12px)",
      }}
      whileHover={{ scale: 1.012, transition: { duration: 0.22 } }}
    >
      {/* Radial glow blooms from top on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% -10%, ${accentColor}14 0%, transparent 65%)`,
        }}
      />
      {/* Glowing top-border line on hover */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/5 opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}70, transparent)`,
        }}
      />
      {children}
    </motion.div>
  );
}

// ── Section component ─────────────────────────────────────────────────────────
export function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      className="py-28 relative overflow-hidden"
      style={{ background: "var(--bg-page)" }}
    >
      {/* Ambient glows — different position from HeroSection to avoid repetition */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-24 right-1/4 w-[560px] h-[420px] rounded-full blur-[140px]"
          style={{ background: "var(--glow-purple)" }}
        />
        <div
          className="absolute bottom-0 left-1/4 w-[480px] h-[380px] rounded-full blur-[120px]"
          style={{ background: "var(--glow-cyan)" }}
        />
        <div
          className="absolute top-1/2 right-0 w-[320px] h-[280px] rounded-full blur-[100px]"
          style={{ background: "var(--glow-pink)" }}
        />
        {/* Dot grid — same spec as HeroSection */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--dot-grid) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative">
        {/* ── Section header ──────────────────────────────────────────────── */}
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{
              background: `${PURPLE}18`,
              border: `1px solid ${PURPLE}30`,
              color: PURPLE_T,
            }}
          >
            <Sparkles size={11} />
            Built for the Creator Economy
          </motion.div>

          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="font-display font-bold text-4xl md:text-5xl mb-4"
            style={{ color: "var(--text-base)" }}
          >
            Three pillars of{" "}
            <span
              style={{
                background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              creator success.
            </span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="max-w-xl mx-auto text-base leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Real tools built around what creators actually need — not an afterthought
            tacked onto a brand platform.
          </motion.p>
        </motion.div>

        {/* ── Feature cards grid ──────────────────────────────────────────── */}
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 lg:grid-cols-3 gap-5"
        >
          {/* ─────────────────────────────────────────────────────────────── */}
          {/* CARD 1 — AI-Powered Growth Intelligence                         */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <FeatureCard accentColor={PURPLE}>
            <FeaturePill
              icon={Brain}
              label="AI Growth Intelligence"
              color={PURPLE}
              textColor={PURPLE_T}
            />

            <h3
              className="font-display font-bold text-xl mb-2"
              style={{ color: "var(--text-base)" }}
            >
              Your personal AI growth mentor
            </h3>
            <p
              className="text-sm mb-5 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Predictive analytics and content intelligence built specifically for
              creators — not vanity metrics, real growth signals that move the needle.
            </p>

            {/* Mini UI: AI Insight Feed */}
            <div
              className="rounded-2xl overflow-hidden flex-1"
              style={{
                background: "var(--bg-card-subtle)",
                border: `1px solid ${PURPLE}20`,
              }}
            >
              {/* Titlebar */}
              <div
                className="flex items-center gap-2 px-3 py-2.5"
                style={{
                  background: `${PURPLE}10`,
                  borderBottom: `1px solid ${PURPLE}18`,
                }}
              >
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400/60" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/60" />
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
                </div>
                <span
                  className="text-[10px] font-medium ml-1"
                  style={{ color: PURPLE_T }}
                >
                  AI Growth Dashboard
                </span>
                <div
                  className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold"
                  style={{ background: `${PURPLE}20`, color: PURPLE_T }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse inline-block" />
                  LIVE
                </div>
              </div>

              <div className="p-3 space-y-2">
                {/* Insight rows */}
                {[
                  {
                    icon: Zap,
                    label: "Post Reels 3× this week",
                    sub: "94% predicted reach boost",
                    color: PURPLE,
                    textColor: PURPLE_T,
                  },
                  {
                    icon: Clock,
                    label: "Best post time: 7 – 9 PM",
                    sub: "Based on your top audience",
                    color: CYAN,
                    textColor: CYAN_T,
                  },
                  {
                    icon: Target,
                    label: "Tutorial format trending",
                    sub: "2.4× more saves than avg.",
                    color: PINK,
                    textColor: PINK_T,
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors duration-200 hover:brightness-[1.04]"
                    style={{
                      background: "var(--bg-card-hover)",
                      border: "1px solid var(--border-card-faint)",
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${item.color}18` }}
                    >
                      <item.icon size={11} style={{ color: item.textColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[10px] font-medium truncate"
                        style={{ color: "var(--text-base)" }}
                      >
                        {item.label}
                      </div>
                      <div
                        className="text-[9px]"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {item.sub}
                      </div>
                    </div>
                    <ArrowUpRight
                      size={10}
                      style={{ color: item.textColor }}
                      className="shrink-0"
                    />
                  </div>
                ))}

                {/* Animated predicted reach bar */}
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{
                    background: `${PURPLE}10`,
                    border: `1px solid ${PURPLE}20`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[9px] font-medium"
                      style={{ color: PURPLE_T }}
                    >
                      Predicted reach this week
                    </span>
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: EMERALD_T }}
                    >
                      +34%
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--bg-card-hover)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
                        boxShadow: `0 0 8px 2px ${PURPLE}55`,
                      }}
                      initial={{ width: "0%" }}
                      animate={isInView ? { width: "72%" } : { width: "0%" }}
                      transition={{
                        duration: 1.2,
                        delay: 0.8,
                        ease: "easeOut",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Feature bullets */}
            <div className="mt-4 space-y-2">
              {[
                "Predictive performance scoring before you post",
                "Weekly AI-generated content calendar",
                "Niche trend alerts in real time",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-start gap-2 text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <CheckCircle2
                    size={11}
                    className="mt-0.5 shrink-0"
                    style={{ color: PURPLE_T }}
                  />
                  {t}
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* CARD 2 — Unified First-Party Analytics                          */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <FeatureCard accentColor={CYAN}>
            <FeaturePill
              icon={BarChart3}
              label="First-Party Analytics"
              color={CYAN}
              textColor={CYAN_T}
            />

            <h3
              className="font-display font-bold text-xl mb-2"
              style={{ color: "var(--text-base)" }}
            >
              All platforms. One clean view.
            </h3>
            <p
              className="text-sm mb-5 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Own your audience data across TikTok, Instagram, and YouTube — unified
              into a single first-party dashboard you actually control.
            </p>

            {/* Mini UI: Cross-Platform Dashboard */}
            <div
              className="rounded-2xl overflow-hidden flex-1"
              style={{
                background: "var(--bg-card-subtle)",
                border: `1px solid ${CYAN}20`,
              }}
            >
              {/* Combined reach hero stat */}
              <div
                className="px-4 pt-4 pb-3"
                style={{ borderBottom: `1px solid ${CYAN}15` }}
              >
                <div
                  className="text-[8px] font-semibold tracking-widest mb-1"
                  style={{ color: CYAN_T }}
                >
                  TOTAL COMBINED REACH
                </div>
                <div className="flex items-end gap-2">
                  <span
                    className="text-3xl font-bold font-display leading-none"
                    style={{
                      background: `linear-gradient(90deg, ${CYAN}, ${PURPLE})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    4.2M
                  </span>
                  <div
                    className="flex items-center gap-0.5 pb-0.5 text-[10px] font-semibold"
                    style={{ color: EMERALD_T }}
                  >
                    <TrendingUp size={10} />
                    +18.4%
                  </div>
                </div>

                {/* Sparkline SVG */}
                <svg
                  viewBox="0 0 120 24"
                  className="w-full mt-2"
                  style={{ height: 24 }}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient
                      id="feat-spark-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={CYAN} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={CYAN} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,20 C10,19 20,17 30,16 C40,15 48,18 60,14 C72,10 83,8 95,5 C105,3 112,2 120,1"
                    fill="none"
                    stroke={CYAN}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                  <path
                    d="M0,20 C10,19 20,17 30,16 C40,15 48,18 60,14 C72,10 83,8 95,5 C105,3 112,2 120,1 L120,24 L0,24 Z"
                    fill="url(#feat-spark-fill)"
                  />
                </svg>
              </div>

              {/* Per-platform rows */}
              <div className="p-3 space-y-2">
                {[
                  {
                    PlatformIcon: TikTokIcon,
                    platform: "TikTok",
                    followers: "1.8M",
                    engagement: "6.2%",
                    barColor: "#69C9D0",
                    barWidth: "72%",
                    delay: 0.6,
                  },
                  {
                    PlatformIcon: InstagramIcon,
                    platform: "Instagram",
                    followers: "1.4M",
                    engagement: "4.8%",
                    barColor: "#fd5949",
                    barWidth: "57%",
                    delay: 0.75,
                  },
                  {
                    PlatformIcon: YouTubeIcon,
                    platform: "YouTube",
                    followers: "1.0M",
                    engagement: "3.9%",
                    barColor: "#FF0000",
                    barWidth: "44%",
                    delay: 0.9,
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors duration-200 hover:brightness-[1.04]"
                    style={{
                      background: "var(--bg-card-hover)",
                      border: "1px solid var(--border-card-faint)",
                    }}
                  >
                    <row.PlatformIcon className="w-5 h-5 shrink-0 rounded-md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: "var(--text-base)" }}
                        >
                          {row.platform}
                        </span>
                        <span
                          className="text-[9px]"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {row.followers}
                        </span>
                      </div>
                      <div
                        className="h-1 rounded-full overflow-hidden"
                        style={{ background: "var(--bg-card-subtle)" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: row.barColor,
                            boxShadow: `0 0 5px 1px ${row.barColor}55`,
                          }}
                          initial={{ width: "0%" }}
                          animate={
                            isInView
                              ? { width: row.barWidth }
                              : { width: "0%" }
                          }
                          transition={{
                            duration: 1,
                            delay: row.delay,
                            ease: "easeOut",
                          }}
                        />
                      </div>
                    </div>
                    <span
                      className="text-[9px] font-bold shrink-0"
                      style={{ color: CYAN_T }}
                    >
                      {row.engagement}
                    </span>
                  </div>
                ))}

                {/* Audience score badge */}
                <div
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{
                    background: `${CYAN}10`,
                    border: `1px solid ${CYAN}20`,
                  }}
                >
                  <span
                    className="text-[9px] font-medium"
                    style={{ color: CYAN_T }}
                  >
                    Audience Quality Score
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map((s) => (
                      <div
                        key={s}
                        className="w-3 h-1.5 rounded-full"
                        style={{ background: s <= 4 ? CYAN : "var(--bg-card-hover)", opacity: s <= 4 ? 0.85 : 0.3 }}
                      />
                    ))}
                    <span
                      className="ml-1 text-[9px] font-bold"
                      style={{ color: EMERALD_T }}
                    >
                      A+
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature bullets */}
            <div className="mt-4 space-y-2">
              {[
                "Audience data you own — no platform lock-in",
                "Cross-platform engagement benchmarking",
                "Export-ready reports for brand negotiations",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-start gap-2 text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <CheckCircle2
                    size={11}
                    className="mt-0.5 shrink-0"
                    style={{ color: CYAN_T }}
                  />
                  {t}
                </div>
              ))}
            </div>
          </FeatureCard>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* CARD 3 — Creator-Side CRM & Deal Flow                           */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <FeatureCard accentColor={PINK}>
            <FeaturePill
              icon={Handshake}
              label="Creator CRM & Deal Flow"
              color={PINK}
              textColor={PINK_T}
            />

            <h3
              className="font-display font-bold text-xl mb-2"
              style={{ color: "var(--text-base)" }}
            >
              Manage brand deals like a pro
            </h3>
            <p
              className="text-sm mb-5 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              A full deal pipeline built for creators — track outreach, negotiate
              terms, and close long-term partnerships without the spreadsheet chaos.
            </p>

            {/* Mini UI: Deal Pipeline */}
            <div
              className="rounded-2xl overflow-hidden flex-1"
              style={{
                background: "var(--bg-card-subtle)",
                border: `1px solid ${PINK}20`,
              }}
            >
              {/* Revenue forecast header */}
              <div
                className="flex items-center justify-between px-3 py-2.5"
                style={{
                  background: `${PINK}10`,
                  borderBottom: `1px solid ${PINK}18`,
                }}
              >
                <div>
                  <div
                    className="text-[8px] font-semibold tracking-widest"
                    style={{ color: PINK_T }}
                  >
                    PIPELINE REVENUE
                  </div>
                  <div
                    className="text-xl font-bold font-display leading-tight"
                    style={{
                      background: `linear-gradient(90deg, ${PINK}, ${PURPLE})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    $24,800
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-semibold"
                  style={{
                    background: `${PINK}20`,
                    color: PINK_T,
                    border: `1px solid ${PINK}30`,
                  }}
                >
                  <CircleDollarSign size={9} />
                  Q3 2026
                </div>
              </div>

              {/* Kanban-style pipeline stages */}
              <div className="p-3 space-y-2">
                {[
                  {
                    stage: "Negotiating",
                    stageColor: PURPLE,
                    stageTextColor: PURPLE_T,
                    deals: [
                      {
                        brand: "Nike",
                        value: "$8,000",
                        avatarBg: "#111",
                        initial: "N",
                        textColor: "#fff",
                      },
                      {
                        brand: "Sony",
                        value: "$5,200",
                        avatarBg: "#003791",
                        initial: "S",
                        textColor: "#fff",
                      },
                    ],
                  },
                  {
                    stage: "Active",
                    stageColor: EMERALD,
                    stageTextColor: EMERALD_T,
                    deals: [
                      {
                        brand: "Glossier",
                        value: "$4,200",
                        avatarBg: "#f4c8d4",
                        initial: "G",
                        textColor: "#8c2f4d",
                      },
                    ],
                  },
                  {
                    stage: "Awaiting Payment",
                    stageColor: PINK,
                    stageTextColor: PINK_T,
                    deals: [
                      {
                        brand: "Razer",
                        value: "$7,400",
                        avatarBg: "#00d26a",
                        initial: "R",
                        textColor: "#000",
                      },
                    ],
                  },
                ].map((group, si) => (
                  <div
                    key={si}
                    className="rounded-xl p-2.5 transition-colors duration-200 hover:brightness-[1.04]"
                    style={{
                      background: "var(--bg-card-hover)",
                      border: "1px solid var(--border-card-faint)",
                    }}
                  >
                    {/* Stage label */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: group.stageColor }}
                      />
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wide"
                        style={{ color: group.stageTextColor }}
                      >
                        {group.stage}
                      </span>
                    </div>

                    {/* Deal rows */}
                    <div className="space-y-1.5">
                      {group.deals.map((deal, di) => (
                        <div key={di} className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold"
                            style={{
                              background: deal.avatarBg,
                              color: deal.textColor,
                            }}
                          >
                            {deal.initial}
                          </div>
                          <span
                            className="text-[10px] flex-1"
                            style={{ color: "var(--text-base)" }}
                          >
                            {deal.brand}
                          </span>
                          <span
                            className="text-[9px] font-semibold tabular-nums"
                            style={{ color: group.stageTextColor }}
                          >
                            {deal.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature bullets */}
            <div className="mt-4 space-y-2">
              {[
                "Deal pipeline from first contact to payment",
                "Contract tracking and deliverable reminders",
                "Long-term partnership relationship scoring",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-start gap-2 text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <CheckCircle2
                    size={11}
                    className="mt-0.5 shrink-0"
                    style={{ color: PINK_T }}
                  />
                  {t}
                </div>
              ))}
            </div>
          </FeatureCard>
        </motion.div>

        {/* ── Bottom accent strip ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          {[
            { color: PURPLE, label: "AI Insights included in every plan" },
            { color: CYAN, label: "Cross-platform analytics from day one" },
            { color: PINK, label: "Unlimited deal tracking, always" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: item.color, boxShadow: `0 0 5px 1px ${item.color}88` }}
              />
              <span className="text-[11px]">{item.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
