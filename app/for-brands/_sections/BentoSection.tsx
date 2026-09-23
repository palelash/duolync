"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import {
  Sparkles,
  Calendar,
  Brain,
  Globe,
  Database,
  Search,
  CheckCircle2,
  Star,
  Mail,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";
import nova1 from "@/assets/nova1.png";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return { ref, isInView };
}

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
      transition={{ duration: 0.6 }}
      className={`rounded-3xl p-6 overflow-hidden relative group transition-all duration-500 ${className}`}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${borderColor}`,
        backdropFilter: "blur(12px)",
      }}
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
    >
      {glowColor && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: `radial-gradient(circle at 50% 0%, ${glowColor} 0%, transparent 70%)` }}
        />
      )}
      {children}
    </motion.div>
  );
}

function FeatureBadge({ color, Icon, label }: { color: string; Icon: React.ElementType; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3" style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      <Icon size={11} />
      {label}
    </div>
  );
}

export function BentoSection() {
  const { ref, isInView } = useReveal();

  return (
    <section className="py-28 bg-[var(--bg-page)] relative overflow-hidden">
      {/* Ambient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none" style={{ background: "rgba(124,58,237,0.04)" }} />

      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.3)", color: "var(--accent-violet-text)" }}>
            <Sparkles size={11} />
            Platform Overview
          </motion.div>
          <motion.h2 variants={fadeUp} className="font-display font-bold text-white text-4xl md:text-5xl mb-4">
            Six tools. One platform.{" "}
            <span style={{ background: "linear-gradient(90deg, #a78bfa, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Infinite scale.
            </span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-slate-400 max-w-lg mx-auto">
            Everything a modern brand needs to run influencer marketing — powered by AI.
          </motion.p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          style={{ gridAutoRows: "minmax(260px, auto)" }}
        >
          {/* 1 — AI Matching: spans 2 cols */}
          <GlassCard
            className="lg:col-span-2"
            borderColor="rgba(124,58,237,0.25)"
            glowColor="var(--glow-purple)"
          >
            <FeatureBadge color="var(--accent-violet-text)" Icon={Sparkles} label="AI Smart Matching" />
            <h3 className="font-display font-bold text-white text-xl mb-1">Find the right creator in seconds</h3>
            <p className="text-slate-500 text-sm mb-5">AI analyzes audience demographics, engagement quality, and brand affinity to surface the most relevant creators for your campaign.</p>

            {/* Creator cards mockup */}
            <div className="flex gap-3 flex-wrap">
              {[
                {
                  label: "Beauty", followers: "2.4M", match: 96,
                  barGradient: "from-pink-500 to-rose-400",
                  glow: "rgba(244,114,182,0.5)",
                  iconBg: "rgba(244,114,182,0.08)",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <defs><linearGradient id="fb-beauty-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f472b6"/><stop offset="100%" stopColor="#fb7185"/></linearGradient></defs>
                      <path d="M10 2.5C10 2.5 10.5 1 12 1s2 1.5 2 1.5L13.5 6h-3L10 2.5z" stroke="url(#fb-beauty-grad)" strokeWidth="1.2" strokeLinejoin="round"/>
                      <rect x="9.5" y="6" width="5" height="8" rx="0.5" stroke="url(#fb-beauty-grad)" strokeWidth="1.2"/>
                      <line x1="9.5" y1="9" x2="14.5" y2="9" stroke="url(#fb-beauty-grad)" strokeWidth="1" opacity="0.6"/>
                      <rect x="8.5" y="14" width="7" height="2.5" rx="0.5" stroke="url(#fb-beauty-grad)" strokeWidth="1.2"/>
                      <rect x="9" y="16.5" width="6" height="3.5" rx="1" stroke="url(#fb-beauty-grad)" strokeWidth="1.2"/>
                    </svg>
                  ),
                },
                {
                  label: "Tech", followers: "1.1M", match: 91,
                  barGradient: "from-blue-500 to-cyan-400",
                  glow: "rgba(96,165,250,0.5)",
                  iconBg: "rgba(96,165,250,0.08)",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <defs><linearGradient id="fb-tech-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient></defs>
                      <rect x="2" y="4" width="20" height="13" rx="2" stroke="url(#fb-tech-grad)" strokeWidth="1.3"/>
                      <path d="M8 20h8M12 17v3" stroke="url(#fb-tech-grad)" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M7 9l2.5 2.5L7 14" stroke="url(#fb-tech-grad)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M13 13h3" stroke="url(#fb-tech-grad)" strokeWidth="1.3" strokeLinecap="round" opacity="0.7"/>
                    </svg>
                  ),
                },
                {
                  label: "Gaming", followers: "890K", match: 88,
                  barGradient: "from-purple-500 to-indigo-400",
                  glow: "rgba(167,139,250,0.5)",
                  iconBg: "rgba(129,140,248,0.08)",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <defs><linearGradient id="fb-gaming-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#818cf8"/></linearGradient></defs>
                      <rect x="2" y="7" width="20" height="12" rx="3.5" stroke="url(#fb-gaming-grad)" strokeWidth="1.3"/>
                      <path d="M8 11v4M6 13h4" stroke="url(#fb-gaming-grad)" strokeWidth="1.3" strokeLinecap="round"/>
                      <circle cx="16" cy="12" r="1" fill="url(#fb-gaming-grad)" opacity="0.8"/>
                      <circle cx="18.5" cy="13.5" r="1" fill="url(#fb-gaming-grad)" opacity="0.8"/>
                      <circle cx="16" cy="15" r="1" fill="url(#fb-gaming-grad)" opacity="0.8"/>
                      <circle cx="13.5" cy="13.5" r="1" fill="url(#fb-gaming-grad)" opacity="0.8"/>
                    </svg>
                  ),
                },
              ].map((c, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[120px] rounded-2xl p-3 backdrop-blur-sm transition-all duration-300 hover:scale-[1.03]"
                  style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center mb-2 shrink-0"
                    style={{ background: c.iconBg }}
                  >
                    {c.icon}
                  </div>
                  {/* Animated progress bar */}
                  <div className="h-1.5 rounded-full mb-1 bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${c.barGradient} transition-all duration-700 ease-out`}
                      style={{
                        width: isInView ? `${c.match}%` : "0%",
                        transitionDelay: `${0.3 + i * 0.12}s`,
                        boxShadow: `0 0 6px 1px ${c.glow}`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500">{c.followers}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{c.label}</span>
                    <span className="text-xs font-bold text-emerald-400">{c.match}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Search bar mockup */}
            <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}>
              <Search size={14} className="text-slate-600 shrink-0" />
              <span className="text-slate-600 text-xs flex-1">Search creators by niche, audience, or platform...</span>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: "rgba(124,58,237,0.2)", color: "var(--accent-violet-text)" }}>AI</span>
              </div>
            </div>
          </GlassCard>

          {/* 2 — Campaign Calendar */}
          <GlassCard borderColor="rgba(6,182,212,0.25)" glowColor="rgba(6,182,212,0.06)">
            <FeatureBadge color="var(--accent-cyan-text)" Icon={Calendar} label="Campaign Calendar" />
            <h3 className="font-display font-bold text-white text-lg mb-1">Plan at scale</h3>
            <p className="text-slate-500 text-xs mb-3">Multi-creator scheduling, deadline tracking, and "What & When" for every post.</p>

            {/* Mini calendar */}
            <div className="rounded-xl p-3" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--bg-card-hover)" }}>
              <div className="grid grid-cols-7 gap-0.5 mb-1.5">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} className="text-[8px] text-slate-700 text-center py-0.5">{d}</div>
                ))}
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <div
                    key={d}
                    className="text-[8px] text-center py-1 rounded-md transition-all"
                    style={{
                      background: [3, 7, 14, 21].includes(d)
                        ? "rgba(124,58,237,0.5)"
                        : [5, 12, 19].includes(d)
                        ? "rgba(6,182,212,0.4)"
                        : "transparent",
                      color: [3, 7, 14, 21, 5, 12, 19].includes(d) ? "var(--text-base)" : "var(--text-muted)",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 mt-2">
                {[
                  { color: "var(--accent-violet-text)", text: "Unboxing — @nova.style" },
                  { color: "var(--accent-cyan-text)", text: "Story collab — @fitlife.co" },
                  { color: "var(--accent-emerald-text)", text: "Review post — @techguru" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* 3 — AI Ad Strategy */}
          <GlassCard borderColor="rgba(52,211,153,0.25)" glowColor="var(--glow-emerald)">
            <FeatureBadge color="var(--accent-emerald-text)" Icon={Brain} label="AI Ad Consultant" />
            <h3 className="font-display font-bold text-white text-lg mb-1">AI-crafted ad strategies</h3>
            <p className="text-slate-500 text-xs mb-3">Receive recommendations on the best ad types for maximum ROI.</p>

            {/* Chat mockup */}
            <div className="space-y-2">
              <div
                className="rounded-xl px-3 py-2 text-xs text-slate-300 max-w-[90%]"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
              >
                Best format for a skincare launch on TikTok?
              </div>
              <div
                className="rounded-xl px-3 py-2 text-xs text-white ml-auto max-w-[92%]"
                style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(6,182,212,0.2))", border: "1px solid rgba(52,211,153,0.25)" }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles size={9} className="text-emerald-400" />
                  <span className="text-emerald-400 font-semibold text-[10px]">AI Recommendation</span>
                </div>
                <strong>Storytelling (60s reel)</strong> — 3.2× avg ROI. Show before/after with authentic testimonial.
              </div>
              <div
                className="rounded-xl px-3 py-2 text-xs ml-auto max-w-[88%]"
                style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--bg-card-hover)", color: "var(--text-muted)" }}
              >
                <span className="text-amber-400 font-medium">Also try:</span> Comparison, Unboxing
              </div>
            </div>
          </GlassCard>

          {/* 4 — Browser Extension — Coming Soon */}
          <GlassCard borderColor="rgba(251,191,36,0.22)" glowColor="rgba(251,191,36,0.05)">
            <FeatureBadge color="var(--accent-amber-text)" Icon={Globe} label="Browser Extension · Coming Soon" />
            <h3 className="font-display font-bold text-white text-lg mb-1">Scout creators anywhere</h3>
            <p className="text-slate-500 text-xs mb-3">Coming soon — save creators from TikTok, Instagram & YouTube with one click.</p>

            {/* Browser window mockup */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-page-alt)", border: "1px solid var(--border-card-strong)" }}>
              <div data-fixed-dark className="flex items-center gap-1.5 px-3 py-2" style={{ background: "#080810", borderBottom: "1px solid var(--bg-card-hover)" }}>
                <div className="w-2 h-2 rounded-full bg-red-500/70" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/70" />
                <div className="w-2 h-2 rounded-full bg-green-500/70" />
                <div className="flex-1 mx-2 rounded-md px-2 py-0.5 text-[8px]" style={{ background: "rgba(255,255,255,0.08)", color: "#cbd5e1" }}>
                  tiktok.com/@nova.style
                </div>
              </div>
              <div className="p-3 flex items-center gap-2">
                <Image src={nova1} alt="Nova Beauty" width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold text-slate-200">Nova Beauty</div>
                  <div className="text-[9px] text-slate-600">1.8M followers · Beauty</div>
                </div>
                <button
                  tabIndex={-1}
                  className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                >
                  + Save
                </button>
              </div>
              {/* Extension popup overlay */}
              <div className="mx-3 mb-3 rounded-xl p-2" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                <div className="flex items-center gap-1.5 text-[9px] text-violet-300">
                  <CheckCircle2 size={9} />
                  Saved to list · View profile →
                </div>
              </div>
            </div>
          </GlassCard>

          {/* 5 — Creator Database & Outreach: spans 2 cols */}
          <GlassCard
            className="lg:col-span-2"
            borderColor="rgba(56,189,248,0.22)"
            glowColor="rgba(56,189,248,0.06)"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "var(--accent-sky-text)18", color: "var(--accent-sky-text)", border: "1px solid var(--accent-sky-text)30" }}>
                <Database size={11} />
                Creator Database &amp; Outreach
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(56,189,248,0.15)", color: "var(--accent-sky-text)", border: "1px solid rgba(56,189,248,0.35)" }}
              >
                Beta
              </span>
            </div>
            <h3 className="font-display font-bold text-white text-xl mb-1">Organized outreach. Zero chaos.</h3>
            <p className="text-slate-500 text-sm mb-5">Centralized creator database with collaboration invites, deal tracking, and full campaign history.</p>

            {/* CRM table mockup */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}>
              {/* Table header */}
              <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] font-medium text-slate-600" style={{ borderBottom: "1px solid var(--bg-card-hover)" }}>
                <span>Creator</span>
                <span>Platform</span>
                <span>Status</span>
                <span>Last Contact</span>
              </div>
              {[
                { name: "@nova.style", platform: "TikTok", status: "Active", statusColor: "var(--accent-emerald-text)", days: "Today", avatarBg: "rgba(244,114,182,0.18)", avatarColor: "var(--accent-pink-text)" },
                { name: "@fitlife.co", platform: "Instagram", status: "Negotiating", statusColor: "var(--accent-amber-text)", days: "2d ago", avatarBg: "rgba(251,191,36,0.18)", avatarColor: "var(--accent-amber-text)" },
                { name: "@techguru", platform: "YouTube", status: "Pending", statusColor: "var(--accent-sky-text)", days: "5d ago", avatarBg: "rgba(96,165,250,0.18)", avatarColor: "var(--accent-sky-text)" },
                { name: "@travel.joe", platform: "TikTok", status: "Completed", statusColor: "var(--accent-violet-text)", days: "1w ago", avatarBg: "rgba(167,139,250,0.18)", avatarColor: "var(--accent-violet-text)" },
              ].map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 gap-2 px-4 py-2.5 items-center transition-all duration-200 hover:bg-white/[0.02]"
                  style={{ borderBottom: i < 3 ? "1px solid var(--bg-card-hover)" : "none" }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ background: row.avatarBg, color: row.avatarColor }}
                    >
                      {row.name.replace("@", "").charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-300 truncate">{row.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{row.platform}</span>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full w-fit"
                    style={{ background: `color-mix(in srgb, ${row.statusColor} 9%, transparent)`, color: row.statusColor }}
                  >
                    {row.status}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-600">{row.days}</span>
                    <Mail size={10} className="text-slate-700" />
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom action bar */}
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] text-slate-600">128 creators in database</span>
              <button
                tabIndex={-1}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                style={{ background: "rgba(56,189,248,0.15)", color: "var(--accent-sky-text)", border: "1px solid rgba(56,189,248,0.25)" }}
              >
                <Mail size={11} />
                Bulk Email (128)
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}
