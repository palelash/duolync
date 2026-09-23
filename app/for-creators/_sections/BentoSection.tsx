"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { Filter, LayoutDashboard, Mail, Brain, Map, Sparkles, CheckCircle2, TrendingUp, Star } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const PINK = "#f472b6";
const VIOLET = "#c084fc";
const CYAN = "#67e8f9";
const AMBER = "#fcd34d";
const EMERALD = "#34d399";

const PINK_T = "var(--accent-pink-text)";
const VIOLET_T = "var(--accent-purple-text)";
const CYAN_T = "var(--accent-cyan-text)";
const AMBER_T = "var(--accent-amber-text)";
const EMERALD_T = "var(--accent-emerald-text)";

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
      style={{ background: "var(--bg-card)", border: `1px solid ${borderColor}`, backdropFilter: "blur(12px)" }}
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
    >
      {glowColor && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: `radial-gradient(circle at 50% 0%, ${glowColor} 0%, transparent 65%)` }}
        />
      )}
      {children}
    </motion.div>
  );
}

function Badge({ color, Icon, label }: { color: string; Icon: React.ElementType; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3" style={{ background: `color-mix(in srgb, ${color} 9%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)` }}>
      <Icon size={11} />
      {label}
    </div>
  );
}

const niches = ["Beauty", "Tech", "Gaming", "Fitness", "Travel", "Food"];

export function BentoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none" style={{ background: "rgba(219,39,119,0.04)" }} />

      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4" style={{ background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.3)", color: "var(--accent-pink-text)" }}>
            <Sparkles size={11} />
            Platform Overview
          </motion.div>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="font-display font-bold text-white text-4xl md:text-5xl mb-4">
            Your entire career.{" "}
            <span style={{ background: "linear-gradient(90deg, #f472b6, #c084fc, #67e8f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              One platform.
            </span>
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-slate-400 max-w-lg mx-auto">
            From landing your first deal to scaling to millions — everything you need to grow as a creator.
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
          {/* 1 — Smart Filters: wide */}
          <GlassCard className="lg:col-span-2" borderColor={`${PINK}30`} glowColor={`${PINK}08`}>
            <Badge color={PINK_T} Icon={Filter} label="Smart Filters" />
            <h3 className="font-display font-bold text-white text-xl mb-1">You set the rules. We bring the deals.</h3>
            <p className="text-slate-500 text-sm mb-4">Filter brand opportunities by niche, minimum budget, location, and audience size — so you only see offers worth your time.</p>

            {/* Filter mockup */}
            <div className="flex flex-wrap gap-2 mb-4">
              {niches.map((niche, i) => (
                <div
                  key={niche}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: i < 3 ? `${PINK}20` : "var(--bg-card-hover)",
                    border: `1px solid ${i < 3 ? `${PINK}40` : "var(--border-card-strong)"}`,
                    color: i < 3 ? PINK_T : "var(--text-muted)",
                  }}
                >
                  {i < 3 && <span className="mr-1">✓</span>}{niche}
                </div>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="rounded-xl px-3 py-2 text-xs flex-1 min-w-[120px]" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}>
                <div className="text-slate-600 text-[9px] mb-1">Min. Offer Amount</div>
                <div className="text-white font-semibold">$500+</div>
                <div className="mt-1.5 h-1 rounded-full" style={{ background: "var(--border-card-strong)" }}>
                  <div className="h-1 rounded-full w-1/2" style={{ background: `linear-gradient(90deg, ${PINK}, ${VIOLET})` }} />
                </div>
              </div>
              <div className="rounded-xl px-3 py-2 text-xs flex-1 min-w-[120px]" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}>
                <div className="text-slate-600 text-[9px] mb-1">Location</div>
                <div className="text-white font-semibold">US & EU</div>
                <div className="mt-1.5 flex gap-1">
                  {["🇺🇸", "🇬🇧", "🇩🇪", "🇫🇷"].map((f) => (
                    <span key={f} className="text-base leading-none">{f}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl px-3 py-2 text-xs flex-1 min-w-[120px]" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}>
                <div className="text-slate-600 text-[9px] mb-1">Audience Size</div>
                <div className="text-white font-semibold">10K – 5M</div>
                <div className="mt-1.5 h-1 rounded-full" style={{ background: "var(--border-card-strong)" }}>
                  <div className="h-1 rounded-full w-3/4" style={{ background: `linear-gradient(90deg, ${CYAN}, ${VIOLET})` }} />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* 2 — Omni Dashboard */}
          <GlassCard borderColor={`${VIOLET}30`} glowColor={`${VIOLET}08`}>
            <Badge color={VIOLET_T} Icon={LayoutDashboard} label="Omni Dashboard" />
            <h3 className="font-display font-bold text-white text-lg mb-1">All platforms, one screen</h3>
            <p className="text-slate-500 text-xs mb-3">TikTok, Instagram, YouTube — plan, schedule, and track from one unified calendar.</p>

            {/* Platform icons + calendar mini */}
            <div className="flex gap-2 mb-3">
              {[
                { label: "TikTok", color: "var(--accent-pink-text)", bg: "rgba(244,114,182,0.15)" },
                { label: "Instagram", color: "var(--accent-purple-text)", bg: "rgba(192,132,252,0.15)" },
                { label: "YouTube", color: "var(--accent-red-text)", bg: "rgba(248,113,113,0.15)" },
              ].map((p) => (
                <div key={p.label} className="flex-1 rounded-xl py-2 text-center text-[10px] font-medium" style={{ background: p.bg, color: p.color, border: `1px solid color-mix(in srgb, ${p.color} 15%, transparent)` }}>
                  {p.label}
                </div>
              ))}
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--bg-card-hover)" }}>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["M","T","W","T","F","S","S"].map((d, i) => (
                  <div key={i} className="text-[8px] text-slate-700 text-center">{d}</div>
                ))}
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <div
                    key={d}
                    className="text-[8px] text-center py-1 rounded"
                    style={{
                      background: [4, 8, 15, 22].includes(d) ? `${PINK}40` : [6, 13, 20].includes(d) ? `${VIOLET}35` : "transparent",
                      color: [4,8,15,22,6,13,20].includes(d) ? "var(--text-base)" : "var(--text-muted)",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* 3 — Deal Inbox & Tracking */}
          <GlassCard borderColor={`${CYAN}28`} glowColor={`${CYAN}06`}>
            <Badge color={CYAN_T} Icon={Mail} label="Deal Inbox & Tracking" />
            <h3 className="font-display font-bold text-white text-lg mb-1">One inbox. Zero chaos.</h3>
            <p className="text-slate-500 text-xs mb-3">Every brand communication, deal negotiation, and follow-up — all in one place.</p>

            {/* Inbox mockup */}
            <div className="space-y-2">
              {[
                { brand: "Adidas Collab", msg: "We'd love to work with you on...", time: "2m", unread: true, avatarBg: "#111111", avatarColor: "#ffffff", initial: "A" },
                { brand: "Fenty Beauty", msg: "Your proposal has been accepted!", time: "1h", unread: true, avatarBg: "#6b2737", avatarColor: "#f9a8d4", initial: "F" },
                { brand: "Spotify", msg: "Re: Campaign brief — attached", time: "3h", unread: false, avatarBg: "#1db954", avatarColor: "#000000", initial: "S" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-xl p-2.5"
                  style={{ background: item.unread ? "var(--bg-card-hover)" : "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,${item.unread ? "0.08" : "0.04"})` }}
                >
                  <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ background: item.avatarBg, color: item.avatarColor }}>{item.initial}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-200 truncate">{item.brand}</span>
                      <span className="text-[9px] text-slate-600 shrink-0">{item.time}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{item.msg}</div>
                  </div>
                  {item.unread && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CYAN }} />}
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 4 — AI Growth: wide */}
          <GlassCard className="lg:col-span-2" borderColor={`${EMERALD}28`} glowColor={`${EMERALD}06`}>
            <Badge color={EMERALD_T} Icon={Brain} label="AI Growth Mentor" />
            <h3 className="font-display font-bold text-white text-xl mb-1">Your personal AI content strategist</h3>
            <p className="text-slate-500 text-sm mb-4">Whether you're just starting or already viral — the AI analyzes your stats and gives personalized growth tips.</p>

            {/* Stats + AI suggestion */}
            <div className="flex gap-3 mb-3 flex-wrap">
              {[
                { label: "Avg. Engagement", value: "4.2%", trend: "+0.8%", color: EMERALD_T },
                { label: "Best Post Time", value: "7–9 PM", trend: "Tue & Thu", color: CYAN_T },
                { label: "Growth Rate", value: "+12%", trend: "vs last month", color: VIOLET_T },
              ].map((s, i) => (
                <div key={i} className="flex-1 min-w-[100px] rounded-xl p-3" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--bg-card-hover)" }}>
                  <div className="text-[9px] text-slate-600 mb-1">{s.label}</div>
                  <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[9px] text-slate-600">{s.trend}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles size={11} className="text-emerald-400" />
                <span className="text-[10px] font-semibold text-emerald-400">AI TIP OF THE WEEK</span>
              </div>
              <p className="text-xs text-slate-300">Your Reels get 2.4× more saves on Tuesdays. Try posting your next brand collab on <strong>Tuesday at 7 PM</strong> for maximum reach.</p>
            </div>
          </GlassCard>

          {/* 5 — Roadmap */}
          <GlassCard borderColor={`${AMBER}28`} glowColor={`${AMBER}06`}>
            <Badge color={AMBER_T} Icon={Map} label="Creator Roadmap" />
            <h3 className="font-display font-bold text-white text-lg mb-1">Newbie to Pro path</h3>
            <p className="text-slate-500 text-xs mb-3">AI-guided steps from 0 to your first 10K followers and first paid deal.</p>

            {/* Roadmap steps */}
            <div className="space-y-2">
              {[
                { step: "Profile Optimization", done: true },
                { step: "First 1K followers", done: true },
                { step: "Content Consistency", done: true },
                { step: "First brand pitch", done: false, active: true },
                { step: "10K milestone", done: false },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                    style={{
                      background: s.done ? `${AMBER}30` : s.active ? `${AMBER}20` : "var(--bg-card-hover)",
                      border: `1px solid ${s.done ? `${AMBER}50` : s.active ? `${AMBER}40` : "var(--border-card-strong)"}`,
                      color: s.done ? AMBER_T : s.active ? AMBER_T : "var(--text-muted)",
                    }}
                  >
                    {s.done ? "✓" : i + 1}
                  </div>
                  <span className="text-[11px]" style={{ color: s.done ? "var(--text-muted)" : s.active ? "var(--text-base)" : "var(--text-muted)" }}>{s.step}</span>
                  {s.active && (
                    <div className="ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: `${AMBER}20`, color: AMBER_T }}>NOW</div>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}
