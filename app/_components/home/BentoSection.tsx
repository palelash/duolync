"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import {
  Search,
  Mail,
  Database,
  Brain,
  Globe,
  BarChart3,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Heart,
} from "lucide-react";
import Image from "next/image";
import nova1 from "@/assets/nova1.png";
import nova2 from "@/assets/nova2.png";
import nova3 from "@/assets/nova3.png";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// Bright hues for tints (backgrounds, borders, glows) — legible in both themes.
const PURPLE = "#a78bfa";
const CYAN = "#67e8f9";
const PINK = "#f472b6";
const EMERALD = "#34d399";
const AMBER = "#fcd34d";

// Theme-aware equivalents for text, which needs to darken on a light page.
const PURPLE_T = "var(--accent-violet-text)";
const CYAN_T = "var(--accent-cyan-text)";
const PINK_T = "var(--accent-pink-text)";
const EMERALD_T = "var(--accent-emerald-text)";
const AMBER_T = "var(--accent-amber-text)";

function GlassCard({
  children,
  className = "",
  borderColor = "var(--border-card)",
  glowColor,
}: {
  children: React.ReactNode;
  className?: string;
  borderColor?: string;
  glowColor?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.55 }}
      className={`rounded-3xl p-6 overflow-hidden relative group transition-all duration-500 ${className}`}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${borderColor}`,
        backdropFilter: "blur(12px)",
      }}
      whileHover={{ scale: 1.015, transition: { duration: 0.2 } }}
    >
      {glowColor && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${glowColor} 0%, transparent 65%)`,
          }}
        />
      )}
      {children}
    </motion.div>
  );
}

export function BentoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      className="py-28 relative overflow-hidden"
      style={{ background: "var(--bg-page-alt)" }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-[160px] pointer-events-none"
        style={{ background: "var(--glow-purple)" }}
      />

      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4 text-violet-700 dark:text-violet-300"
            style={{
              background: "rgba(124,58,237,0.10)",
              border: "1px solid rgba(124,58,237,0.3)",
              color: PURPLE_T,
            }}
          >
            <Sparkles size={11} />
            Platform Capabilities
          </motion.div>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="font-display font-bold text-4xl md:text-5xl mb-4"
            style={{ color: "var(--text-base)" }}
          >
            Everything under{" "}
            <span
              style={{
                background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              one roof.
            </span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="max-w-lg mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            AI-powered tools for brands and creators — from discovery to deal,
            all in one seamless platform.
          </motion.p>
        </motion.div>

        {/* Bento grid */}
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          style={{ gridAutoRows: "minmax(250px, auto)" }}
        >
          {/* 1: AI Search — wide */}
          <GlassCard
            className="lg:col-span-2"
            borderColor={`${PURPLE}28`}
            glowColor={`${PURPLE}08`}
          >
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
              style={{
                background: `${PURPLE}18`,
                color: PURPLE_T,
                border: `1px solid ${PURPLE}30`,
              }}
            >
              <Search size={11} />
              AI Influencer Search
            </div>
            <h3 className="font-display font-bold text-xl mb-1" style={{ color: "var(--text-base)" }}>
              Find creators that actually convert
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              Search verified creators by niche, platform, engagement rate, and
              audience demographics.
            </p>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3"
              style={{
                background: "var(--bg-card-hover)",
                border: "1px solid var(--border-card-strong)",
              }}
            >
              <Search size={13} className="text-slate-600" />
              <span className="text-slate-600 text-xs flex-1">
                Search by niche, hashtag, or platform...
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded font-medium"
                style={{ background: `${PURPLE}25`, color: PURPLE_T }}
              >
                AI
              </span>
            </div>
            <div className="flex gap-3">
              {[
                {
                  label: "Beauty",
                  followers: "2.4M",
                  match: 96,
                  barGradient: "from-pink-500 to-rose-400",
                  glow: "rgba(244,114,182,0.5)",
                  iconBg: "rgba(244,114,182,0.08)",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <defs>
                        <linearGradient id="beauty-grad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#f472b6" />
                          <stop offset="100%" stopColor="#fb7185" />
                        </linearGradient>
                      </defs>
                      {/* Tip */}
                      <path d="M10 2.5C10 2.5 10.5 1 12 1s2 1.5 2 1.5L13.5 6h-3L10 2.5z" stroke="url(#beauty-grad)" strokeWidth="1.2" strokeLinejoin="round"/>
                      {/* Body */}
                      <rect x="9.5" y="6" width="5" height="8" rx="0.5" stroke="url(#beauty-grad)" strokeWidth="1.2"/>
                      {/* Band */}
                      <line x1="9.5" y1="9" x2="14.5" y2="9" stroke="url(#beauty-grad)" strokeWidth="1" opacity="0.6"/>
                      {/* Base */}
                      <rect x="8.5" y="14" width="7" height="2.5" rx="0.5" stroke="url(#beauty-grad)" strokeWidth="1.2"/>
                      {/* Cap bottom */}
                      <rect x="9" y="16.5" width="6" height="3.5" rx="1" stroke="url(#beauty-grad)" strokeWidth="1.2"/>
                    </svg>
                  ),
                },
                {
                  label: "Tech",
                  followers: "1.1M",
                  match: 91,
                  barGradient: "from-blue-500 to-cyan-400",
                  glow: "rgba(96,165,250,0.5)",
                  iconBg: "rgba(96,165,250,0.08)",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <defs>
                        <linearGradient id="tech-grad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#22d3ee" />
                        </linearGradient>
                      </defs>
                      <rect x="2" y="4" width="20" height="13" rx="2" stroke="url(#tech-grad)" strokeWidth="1.3"/>
                      <path d="M8 20h8M12 17v3" stroke="url(#tech-grad)" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M7 9l2.5 2.5L7 14" stroke="url(#tech-grad)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M13 13h3" stroke="url(#tech-grad)" strokeWidth="1.3" strokeLinecap="round" opacity="0.7"/>
                    </svg>
                  ),
                },
                {
                  label: "Gaming",
                  followers: "890K",
                  match: 88,
                  barGradient: "from-purple-500 to-indigo-400",
                  glow: "rgba(167,139,250,0.5)",
                  iconBg: "rgba(129,140,248,0.08)",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <defs>
                        <linearGradient id="gaming-grad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" />
                          <stop offset="100%" stopColor="#818cf8" />
                        </linearGradient>
                      </defs>
                      <rect x="2" y="7" width="20" height="12" rx="3.5" stroke="url(#gaming-grad)" strokeWidth="1.3"/>
                      <path d="M8 11v4M6 13h4" stroke="url(#gaming-grad)" strokeWidth="1.3" strokeLinecap="round"/>
                      <circle cx="16" cy="12" r="1" fill="url(#gaming-grad)" opacity="0.8"/>
                      <circle cx="18.5" cy="13.5" r="1" fill="url(#gaming-grad)" opacity="0.8"/>
                      <circle cx="16" cy="15" r="1" fill="url(#gaming-grad)" opacity="0.8"/>
                      <circle cx="13.5" cy="13.5" r="1" fill="url(#gaming-grad)" opacity="0.8"/>
                    </svg>
                  ),
                },
              ].map((c, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-2xl p-3 transition-all hover:scale-[1.02]"
                  style={{
                    background: "var(--bg-card-hover)",
                    border: "1px solid var(--border-card-strong)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center mb-2 shrink-0"
                    style={{ background: c.iconBg }}
                  >
                    {c.icon}
                  </div>

                  {/* Animated progress bar */}
                  <div className="h-1.5 rounded-full mb-1 overflow-hidden" style={{ background: "var(--bg-card-hover)" }}>
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${c.barGradient} transition-all duration-700 ease-out`}
                      style={{
                        width: isInView ? `${c.match}%` : "0%",
                        transitionDelay: `${0.3 + i * 0.12}s`,
                        boxShadow: `0 0 6px 1px ${c.glow}`,
                      }}
                    />
                  </div>

                  <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {c.followers}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {c.label}
                    </span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: EMERALD_T }}
                    >
                      {c.match}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 2: Outreach */}
          <GlassCard borderColor={`${CYAN}28`} glowColor={`${CYAN}06`}>
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
              style={{
                background: `${CYAN}18`,
                color: CYAN_T,
                border: `1px solid ${CYAN}30`,
              }}
            >
              <Mail size={11} />
              One-Click Outreach
            </div>
            <h3 className="font-display font-bold text-lg mb-1" style={{ color: "var(--text-base)" }}>
              Contact at scale
            </h3>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Send collaboration invites with AI-assisted templates.
              Track responses and manage deals from one inbox.
            </p>
            <div
              className="rounded-xl p-3 space-y-2"
              style={{
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--bg-card-hover)",
              }}
            >
              {[
                { brand: "Nike Collab", status: "Replied", color: EMERALD_T, avatarBg: "#111111", avatarColor: "#ffffff", initial: "N" },
                { brand: "Glossier", status: "Sent", color: CYAN_T, avatarBg: "#f4c8d4", avatarColor: "#8c2f4d", initial: "G" },
                { brand: "Razer", status: "Pending", color: AMBER_T, avatarBg: "#00ff00", avatarColor: "#000000", initial: "R" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold"
                    style={{ background: item.avatarBg, color: item.avatarColor }}
                  >
                    {item.initial}
                  </div>
                  <span className="text-[11px] flex-1" style={{ color: "var(--text-base)" }}>
                    {item.brand}
                  </span>
                  <span
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: `${item.color}18`, color: item.color }}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 3: Campaign Tracking */}
          <GlassCard borderColor={`${EMERALD}28`} glowColor={`${EMERALD}06`}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: `${EMERALD}18`,
                  color: EMERALD_T,
                  border: `1px solid ${EMERALD}30`,
                }}
              >
                <Database size={11} />
                Campaign Management
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(52,211,153,0.15)", color: EMERALD_T, border: "1px solid rgba(52,211,153,0.35)" }}
              >
                Beta
              </span>
            </div>
            <h3 className="font-display font-bold text-lg mb-1" style={{ color: "var(--text-base)" }}>
              Ditch the spreadsheet
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Track every deal, campaign, and deliverable in one place.
            </p>
            <div className="space-y-2">
              {[
                {
                  name: "Summer Launch",
                  creators: 8,
                  status: "Active",
                  color: EMERALD_T,
                },
                {
                  name: "Tech Unboxing",
                  creators: 5,
                  status: "Review",
                  color: CYAN_T,
                },
                {
                  name: "Spring Collab",
                  creators: 11,
                  status: "Done",
                  color: PURPLE_T,
                },
              ].map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: "var(--bg-card-subtle)",
                    border: "1px solid var(--bg-card-hover)",
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: c.color }}
                  />
                  <span className="text-[11px] flex-1 truncate" style={{ color: "var(--text-base)" }}>
                    {c.name}
                  </span>
                  <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                    {c.creators} creators
                  </span>
                  <span
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: `${c.color}18`, color: c.color }}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 4: AI Growth — wide */}
          <GlassCard
            className="lg:col-span-2"
            borderColor={`${PINK}28`}
            glowColor={`${PINK}06`}
          >
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
              style={{
                background: `${PINK}18`,
                color: PINK_T,
                border: `1px solid ${PINK}30`,
              }}
            >
              <Brain size={11} />
              AI Growth Tools
            </div>
            <h3 className="font-display font-bold text-xl mb-1" style={{ color: "var(--text-base)" }}>
              AI that works for both sides
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Brands get AI campaign strategy. Creators get a personalized
              growth mentor. Everyone wins.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-2xl p-4"
                style={{
                  background: "var(--glow-purple)",
                  border: "1px solid rgba(124,58,237,0.2)",
                }}
              >
                <div
                  className="text-[10px] font-semibold mb-2"
                  style={{ color: PURPLE_T }}
                >
                  FOR BRANDS
                </div>
                <div className="space-y-1.5">
                  {[
                    "Best ad format for your product",
                    "Top creator matches by ROI",
                    "Campaign calendar automation",
                  ].map((t) => (
                    <div
                      key={t}
                      className="flex items-start gap-1.5 text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <CheckCircle2
                        size={9}
                        className="text-violet-400 mt-0.5 shrink-0"
                      />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              <div
                className="rounded-2xl p-4"
                style={{
                  background: "rgba(244,114,182,0.1)",
                  border: "1px solid rgba(244,114,182,0.2)",
                }}
              >
                <div
                  className="text-[10px] font-semibold mb-2"
                  style={{ color: PINK_T }}
                >
                  FOR CREATORS
                </div>
                <div className="space-y-1.5">
                  {[
                    "Weekly content optimization tips",
                    "Best post times for your audience",
                    "Deal recommendations by niche",
                  ].map((t) => (
                    <div
                      key={t}
                      className="flex items-start gap-1.5 text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <CheckCircle2
                        size={9}
                        className="text-pink-400 mt-0.5 shrink-0"
                      />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* 5: Chrome Extension — Coming Soon */}
          <GlassCard borderColor={`${AMBER}28`} glowColor={`${AMBER}06`}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: `${AMBER}18`,
                  color: AMBER_T,
                  border: `1px solid ${AMBER}30`,
                }}
              >
                <Globe size={11} />
                Browser Extension
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(252,211,77,0.15)", color: AMBER_T, border: "1px solid rgba(252,211,77,0.35)" }}
              >
                Coming Soon
              </span>
            </div>
            <h3 className="font-display font-bold text-lg mb-1" style={{ color: "var(--text-base)" }}>
              Scout from anywhere
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Discover and save creator profiles while browsing TikTok, Instagram & YouTube — coming to Chrome & Edge.
            </p>
            {/* Browser mockup */}
            <div
              role="img"
              aria-label="Preview of the Chrome extension saving a TikTok creator profile straight to the CRM"
              className="rounded-xl overflow-hidden"
              style={{
                background: "var(--bg-page-alt)",
                border: "1px solid var(--border-card)",
              }}
            >
              {/* Browser chrome */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5"
                style={{
                  background: "var(--bg-page)",
                  borderBottom: "1px solid var(--bg-card-hover)",
                }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500/60" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                <div className="w-2 h-2 rounded-full bg-green-500/60" />
                <div
                  className="flex-1 mx-2 rounded text-[8px] text-slate-500 px-2 py-0.5 flex items-center gap-1"
                  style={{ background: "var(--bg-card-hover)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/70 shrink-0" />
                  tiktok.com/@nova.beauty
                </div>
              </div>

              {/* Profile header */}
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="relative shrink-0">
                    <Image
                      src={nova1}
                      alt="Nova Beauty"
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-pink-500/40"
                      width={36}
                      height={36}
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-pink-500 border border-[var(--bg-page-alt)] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-sm bg-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold leading-none" style={{ color: "var(--text-base)" }}>Nova Beauty</span>
                      <svg viewBox="0 0 24 24" fill="#60a5fa" className="w-2.5 h-2.5 shrink-0">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-[8px] text-slate-500 mt-0.5">@nova.beauty · 1.8M followers</div>
                  </div>
                  <button
                    tabIndex={-1}
                    className="px-2.5 py-1 rounded-full text-[8px] font-bold text-white shrink-0"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                  >
                    + Save
                  </button>
                </div>

                {/* Stats row */}
                <div className="flex gap-3 mt-2 px-0.5">
                  {[
                    { label: "Posts", value: "284" },
                    { label: "Following", value: "312" },
                    { label: "Likes", value: "42.1M" },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="text-[9px] font-bold" style={{ color: "var(--text-base)" }}>{s.value}</div>
                      <div className="text-[7px]" style={{ color: "var(--text-faint)" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Video grid */}
              <div className="grid grid-cols-2 gap-0.5 px-3 pb-3">
                <div className="relative rounded-lg overflow-hidden aspect-[9/12]">
                  <Image src={nova2} alt="" className="w-full h-full object-cover" fill sizes="80px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
                    <Heart size={7} className="text-white fill-white" />
                    <span className="text-[7px] text-white font-medium">2.4M</span>
                  </div>
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-sm bg-black/50 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-sm bg-white/80" style={{ clipPath: "polygon(20% 0%, 100% 50%, 20% 100%, 20% 0%)" }} />
                  </div>
                </div>
                <div className="relative rounded-lg overflow-hidden aspect-[9/12]">
                  <Image src={nova3} alt="" className="w-full h-full object-cover" fill sizes="80px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
                    <Heart size={7} className="text-white fill-white" />
                    <span className="text-[7px] text-white font-medium">1.1M</span>
                  </div>
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-sm bg-black/50 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-sm bg-white/80" style={{ clipPath: "polygon(20% 0%, 100% 50%, 20% 100%, 20% 0%)" }} />
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* 6: Analytics */}
          <GlassCard
            borderColor={`rgba(96,165,250,0.28)`}
            glowColor={`rgba(96,165,250,0.06)`}
          >
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
              style={{
                background: "rgba(96,165,250,0.15)",
                color: "var(--accent-sky-text)",
                border: "1px solid rgba(96,165,250,0.3)",
              }}
            >
              <BarChart3 size={11} />
              Real-Time Analytics
            </div>
            <h3 className="font-display font-bold text-lg mb-1" style={{ color: "var(--text-base)" }}>
              Performance at a glance
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Live campaign ROI, engagement tracking, and creator performance
              across all platforms.
            </p>
            <div className="space-y-2">
              {[
                { label: "Campaign ROI", value: "3.8×", color: EMERALD_T },
                { label: "Engagement Rate", value: "5.2%", color: "var(--accent-sky-text)" },
                { label: "Reach", value: "2.8M", color: PURPLE_T },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between"
                >
                  <div>
                    <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{s.label}</div>
                    <div
                      className="h-1.5 rounded-full mt-0.5"
                      style={{ background: "var(--bg-card-hover)", width: 100 }}
                    >
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: "70%", background: s.color }}
                      />
                    </div>
                  </div>
                  <div
                    className="text-sm font-bold font-display"
                    style={{ color: s.color }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}
