"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence, useInView, type Variants } from "framer-motion";
import {
  Target,
  Sparkles,
  Rocket,
  Link2,
  Filter,
  Brain,
  ArrowRight,
  Building2,
  Users,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/app/_components/layout/Navbar";
import Footer from "@/app/_components/layout/Footer";

/* ─── Data ─────────────────────────────────────────────── */

const BRAND_STEPS = [
  {
    number: "01",
    icon: Target,
    title: "Identify Your Audience",
    subtitle: "AI-driven niche targeting",
    description:
      "Tell our AI about your product, brand values, and ideal customer. It maps your DNA to creator audiences across all major platforms — pinpointing exactly who will convert.",
    accent: "#a78bfa",
    accentBg: "var(--glow-purple)",
    accentBorder: "rgba(124,58,237,0.3)",
    perks: ["Audience demographic analysis", "Brand-value alignment scoring", "Multi-platform targeting"],
    mockup: "brand-01",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "AI Smart Match",
    subtitle: "Automated creator discovery",
    description:
      "Our AI ranks creators by a live Compatibility Score — factoring in engagement quality, audience demographics, and niche alignment with your brand.",
    accent: "#67e8f9",
    accentBg: "rgba(6,182,212,0.12)",
    accentBorder: "rgba(6,182,212,0.3)",
    perks: ["Live compatibility score", "Engagement quality analysis", "Filtered creator discovery"],
    mockup: "brand-02",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Launch & Manage",
    subtitle: "Campaign management and tracking",
    description:
      "Plan every post, track every deliverable, and measure results — all in one dashboard. Manage collaboration timelines without leaving the platform.",
    accent: "#34d399",
    accentBg: "rgba(52,211,153,0.12)",
    accentBorder: "rgba(52,211,153,0.3)",
    perks: ["Integrated campaign calendar", "Deliverable and deal tracking", "Campaign analytics dashboard"],
    mockup: "brand-03",
  },
];

const CREATOR_STEPS = [
  {
    number: "01",
    icon: Link2,
    title: "Sync Your Profile",
    subtitle: "Instant social media integration",
    description:
      "Connect TikTok, Instagram, YouTube, and more in seconds. We auto-populate your profile with real stats so brands see the authentic you — no manual data entry.",
    accent: "#f472b6",
    accentBg: "rgba(236,72,153,0.12)",
    accentBorder: "rgba(236,72,153,0.3)",
    perks: ["One-click platform sync", "Auto-populated analytics", "Verified creator badge"],
    mockup: "creator-01",
  },
  {
    number: "02",
    icon: Filter,
    title: "Filter High-Quality Deals",
    subtitle: "Set your minimum rates and niche",
    description:
      "You define the rules. Set minimum offer amounts, preferred niches, and blacklisted categories. Only deals that match your criteria ever reach your inbox.",
    accent: "#fcd34d",
    accentBg: "rgba(252,211,77,0.12)",
    accentBorder: "rgba(252,211,77,0.3)",
    perks: ["Minimum rate filters", "Niche preference controls", "Auto-decline low offers"],
    mockup: "creator-02",
  },
  {
    number: "03",
    icon: Brain,
    title: "Grow with AI",
    subtitle: "AI content insights (Beta)",
    description:
      "Connect your social accounts and get data-driven insights into your content performance. Understand what works, when to post, and what deals to prioritize — powered by your real account data.",
    accent: "#c084fc",
    accentBg: "rgba(192,132,252,0.12)",
    accentBorder: "rgba(192,132,252,0.3)",
    perks: ["Content performance insights", "Best posting time recommendations", "Deal-fit analysis by niche"],
    mockup: "creator-03",
  },
];

/* ─── Mockup visuals ────────────────────────────────────── */

function BrandMockup01() {
  return (
    <div className="space-y-2.5">
      {[
        { label: "Tech & Gaming", pct: 88, color: "#a78bfa" },
        { label: "Beauty & Lifestyle", pct: 72, color: "#f472b6" },
        { label: "Finance", pct: 61, color: "#67e8f9" },
      ].map((row) => (
        <div key={row.label}>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-400">{row.label}</span>
            <span className="font-bold" style={{ color: row.color }}>{row.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--border-card)" }}>
            <motion.div
              className="h-1.5 rounded-full"
              style={{ background: row.color }}
              initial={{ width: 0 }}
              animate={{ width: `${row.pct}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        </div>
      ))}
      <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.25)" }}>
        <Sparkles size={12} style={{ color: "#a78bfa" }} />
        <span className="text-[11px]" style={{ color: "#a78bfa" }}>AI matched <strong>Tech & Gaming</strong> as your top niche</span>
      </div>
    </div>
  );
}

function BrandMockup02() {
  return (
    <div className="space-y-2">
      {[
        { name: "Aisha K.", niche: "Fashion", followers: "120K", match: 96, color: "from-pink-500 to-rose-600" },
        { name: "Liam S.", niche: "Tech", followers: "55K", match: 91, color: "from-violet-500 to-purple-600" },
        { name: "Marcus V.", niche: "Videography", followers: "88K", match: 87, color: "from-amber-500 to-orange-500" },
      ].map((c, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.12 }}
          className="flex items-center gap-2.5 rounded-xl p-2.5"
          style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card)" }}
        >
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${c.color} shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white">{c.name}</div>
            <div className="text-[9px] text-slate-500">{c.niche} · {c.followers}</div>
          </div>
          <div className="text-xs font-bold" style={{ color: "#34d399" }}>{c.match}%</div>
        </motion.div>
      ))}
    </div>
  );
}

function BrandMockup03() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 mb-1">
        {[
          { label: "ROI", value: "3.8×", color: "#34d399" },
          { label: "Reach", value: "2.8M", color: "#67e8f9" },
          { label: "Deals", value: "24", color: "#a78bfa" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-2 text-center" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card)" }}>
            <div className="text-sm font-bold font-display" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px] text-slate-600">{s.label}</div>
          </div>
        ))}
      </div>
      {["Summer Launch · Active", "Unboxing Series · Review", "Spring Collab · Done"].map((c, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}>
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: i === 0 ? "#34d399" : i === 1 ? "#67e8f9" : "#a78bfa" }} />
          <span className="text-[10px] text-slate-400">{c}</span>
        </div>
      ))}
    </div>
  );
}

function CreatorMockup01() {
  return (
    <div className="space-y-2.5">
      {[
        { platform: "TikTok", followers: "1.8M", color: "#f472b6", pct: 92 },
        { platform: "Instagram", followers: "420K", color: "#e1306c", pct: 74 },
        { platform: "YouTube", followers: "210K", color: "#ff0000", pct: 55 },
      ].map((p, i) => (
        <motion.div
          key={p.platform}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 + i * 0.1 }}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card)" }}
        >
          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${p.color}20` }}>
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          </div>
          <span className="text-[11px] font-medium text-white flex-1">{p.platform}</span>
          <span className="text-[10px] text-slate-500">{p.followers}</span>
          <span className="text-[10px] font-bold" style={{ color: p.color }}>{p.pct}%</span>
        </motion.div>
      ))}
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 mt-1" style={{ background: "var(--glow-pink)", border: "1px solid rgba(236,72,153,0.25)" }}>
        <CheckCircle2 size={11} style={{ color: "#f472b6" }} />
        <span className="text-[10px]" style={{ color: "#f472b6" }}>Profile synced · Verified badge earned</span>
      </div>
    </div>
  );
}

function CreatorMockup02() {
  return (
    <div className="space-y-2.5">
      {[
        { label: "Min. offer amount", value: "$500 / post", color: "#fcd34d" },
        { label: "Preferred niche", value: "Beauty, Fashion", color: "#fcd34d" },
        { label: "Blocked categories", value: "Gambling, Alcohol", color: "#f87171" },
      ].map((f) => (
        <div key={f.label} className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card)" }}>
          <div className="text-[9px] text-slate-600 mb-0.5">{f.label}</div>
          <div className="text-[11px] font-semibold" style={{ color: f.color }}>{f.value}</div>
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(252,211,77,0.1)", border: "1px solid rgba(252,211,77,0.25)" }}>
        <Filter size={11} style={{ color: "#fcd34d" }} />
        <span className="text-[10px]" style={{ color: "#fcd34d" }}>3 low-quality offers auto-declined today</span>
      </div>
    </div>
  );
}

function CreatorMockup03() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl p-3" style={{ background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.2)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Brain size={12} style={{ color: "#c084fc" }} />
          <span className="text-[10px] font-semibold" style={{ color: "#c084fc" }}>AI Growth Tools · Beta</span>
        </div>
        {["Post on Tue & Thu 7–9 PM for +34% reach", "Add 3 trending sounds to your next Reel", "Your hook length is 2s — try stretching to 4s"].map((tip, i) => (
          <div key={i} className="flex items-start gap-2 mt-1.5">
            <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: "#c084fc" }} />
            <span className="text-[10px] text-slate-400 leading-relaxed">{tip}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card)" }}>
        <div className="flex-1">
          <div className="text-[9px] text-slate-600 mb-1">Progress to 10K milestone</div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--border-card)" }}>
            <motion.div className="h-1.5 rounded-full" style={{ background: "#c084fc" }} initial={{ width: 0 }} animate={{ width: "68%" }} transition={{ duration: 1, ease: "easeOut", delay: 0.4 }} />
          </div>
        </div>
        <span className="text-sm font-bold font-display shrink-0" style={{ color: "#c084fc" }}>68%</span>
      </div>
    </div>
  );
}

const MOCKUP_MAP: Record<string, React.ReactNode> = {
  "brand-01": <BrandMockup01 />,
  "brand-02": <BrandMockup02 />,
  "brand-03": <BrandMockup03 />,
  "creator-01": <CreatorMockup01 />,
  "creator-02": <CreatorMockup02 />,
  "creator-03": <CreatorMockup03 />,
};

/* ─── Variants ──────────────────────────────────────────── */

const fadeUp: Variants = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.13 } } };

/* ─── Step Card ─────────────────────────────────────────── */

function StepCard({ step, index, isActive, onClick }: {
  step: typeof BRAND_STEPS[0];
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = step.icon;

  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.55 }}
      onClick={onClick}
      className="cursor-pointer rounded-3xl p-6 transition-all duration-300 relative overflow-hidden group"
      style={{
        background: isActive ? step.accentBg : "var(--bg-card)",
        border: `1px solid ${isActive ? step.accentBorder : "var(--border-card)"}`,
        boxShadow: isActive ? `0 0 40px ${step.accent}18` : "none",
      }}
      whileHover={{ scale: 1.01 }}
    >
      {/* Step number watermark */}
      <div
        className="absolute -top-4 -right-2 font-display font-black text-7xl pointer-events-none select-none leading-none"
        style={{ color: isActive ? `${step.accent}12` : "var(--bg-card-subtle)" }}
      >
        {step.number}
      </div>

      <div className="relative">
        {/* Icon + connector line */}
        <div className="flex items-start gap-4 mb-4">
          <div className="relative shrink-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300"
              style={{
                background: isActive ? step.accentBg : "var(--bg-card-hover)",
                border: `1px solid ${isActive ? step.accentBorder : "var(--border-card-strong)"}`,
              }}
            >
              <Icon size={22} style={{ color: isActive ? step.accent : "#475569" }} />
            </div>
            {/* Glow pulse when active */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ border: `1px solid ${step.accent}`, boxShadow: `0 0 18px ${step.accent}50` }}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>

          <div className="pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: isActive ? step.accent : "#475569" }}>
              Step {step.number}
            </div>
            <h3 className={`font-display font-bold text-lg leading-tight transition-colors ${isActive ? "text-white" : "text-slate-500"}`}>
              {step.title}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: isActive ? `${step.accent}cc` : "#334155" }}>
              {step.subtitle}
            </p>
          </div>
        </div>

        {/* Expandable content */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                {step.description}
              </p>

              {/* Perks */}
              <ul className="space-y-1.5 mb-5">
                {step.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-xs" style={{ color: step.accent }}>
                    <CheckCircle2 size={12} className="shrink-0" />
                    {perk}
                  </li>
                ))}
              </ul>

              {/* Mockup card */}
              <div
                className="rounded-2xl p-4"
                style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}
              >
                {MOCKUP_MAP[step.mockup]}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ─── Desktop horizontal step indicator ────────────────── */

function DesktopStepper({ steps, activeIndex, onSelect, tab }: {
  steps: typeof BRAND_STEPS;
  activeIndex: number;
  onSelect: (i: number) => void;
  tab: "brands" | "creators";
}) {
  return (
    <div className="hidden lg:flex items-start gap-0 mb-12 relative">
      {/* Connecting line */}
      <div className="absolute top-6 left-0 right-0 h-px" style={{ background: "var(--border-card)" }} />
      <motion.div
        className="absolute top-6 left-0 h-px"
        style={{ background: tab === "brands" ? "linear-gradient(90deg, #a78bfa, #67e8f9, #34d399)" : "linear-gradient(90deg, #f472b6, #fcd34d, #c084fc)" }}
        animate={{ width: `${((activeIndex + 0.5) / steps.length) * 100}%` }}
        transition={{ duration: 0.4 }}
      />

      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;

        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className="flex-1 flex flex-col items-center gap-3 relative z-10 group"
          >
            {/* Node */}
            <motion.div
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300"
              style={{
                background: isActive || isDone ? step.accentBg : "rgba(9,9,15,1)",
                border: `2px solid ${isActive ? step.accent : isDone ? `${step.accent}60` : "var(--border-card-strong)"}`,
                boxShadow: isActive ? `0 0 24px ${step.accent}40` : "none",
              }}
              animate={isActive ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Icon size={20} style={{ color: isActive ? step.accent : isDone ? `${step.accent}90` : "#475569" }} />
            </motion.div>

            {/* Label */}
            <div className="text-center px-2">
              <div className={`text-sm font-semibold transition-colors ${isActive ? "text-white" : isDone ? "text-slate-400" : "text-slate-600"}`}>
                {step.title}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: isActive ? step.accent : "transparent" }}>
                {step.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────── */

export default function HowItWorksPage() {
  const [tab, setTab] = useState<"brands" | "creators">("brands");
  const [activeStep, setActiveStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  const steps = tab === "brands" ? BRAND_STEPS : CREATOR_STEPS;

  const handleTabChange = (next: "brands" | "creators") => {
    setTab(next);
    setActiveStep(0);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      {/* Navbar */}
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{ background: "var(--bg-navbar)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--border-card)" }}
      >
        <Navbar />
      </div>

      <main className="pt-28 pb-24">
        {/* Ambient glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 left-1/4 w-[600px] h-[600px] rounded-full blur-[160px]" style={{ background: tab === "brands" ? "radial-gradient(circle, var(--glow-purple) 0%, transparent 70%)" : "radial-gradient(circle, var(--glow-pink) 0%, transparent 70%)" }} />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-[140px]" style={{ background: tab === "brands" ? "radial-gradient(circle, var(--glow-cyan) 0%, transparent 70%)" : "radial-gradient(circle, rgba(192,132,252,0.07) 0%, transparent 70%)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle, var(--dot-grid) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
        </div>

        <div className="relative container mx-auto px-4 max-w-5xl">
          {/* Header */}
          <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.55 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.3)", color: "#c4b5fd" }}>
              <Sparkles size={11} />
              How It Works
            </motion.div>

            <motion.h1 variants={fadeUp} transition={{ duration: 0.65 }} className="font-display font-bold text-white mb-4" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)", lineHeight: 1.1 }}>
              Up and running in{" "}
              <span style={{ background: "linear-gradient(90deg, #a78bfa, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                three steps.
              </span>
            </motion.h1>

            <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-slate-400 text-lg max-w-xl mx-auto">
              Whether you're a brand scaling campaigns or a creator landing deals — the process is simple, fast, and AI-powered.
            </motion.p>
          </motion.div>

          {/* Tab toggle */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex justify-center mb-12"
          >
            <div
              className="flex items-center gap-1 p-1 rounded-2xl"
              style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
            >
              <button
                onClick={() => handleTabChange("brands")}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300"
                style={
                  tab === "brands"
                    ? { background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(8,145,178,0.4))", border: "1px solid rgba(124,58,237,0.5)", color: "white" }
                    : { color: "#475569", border: "1px solid transparent" }
                }
              >
                <Building2 size={15} />
                For Brands
              </button>
              <button
                onClick={() => handleTabChange("creators")}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300"
                style={
                  tab === "creators"
                    ? { background: "linear-gradient(135deg, rgba(236,72,153,0.4), rgba(192,132,252,0.4))", border: "1px solid rgba(236,72,153,0.5)", color: "white" }
                    : { color: "#475569", border: "1px solid transparent" }
                }
              >
                <Users size={15} />
                For Creators
              </button>
            </div>
          </motion.div>

          {/* Desktop horizontal stepper */}
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <DesktopStepper steps={steps} activeIndex={activeStep} onSelect={setActiveStep} tab={tab} />
            </motion.div>
          </AnimatePresence>

          {/* Step cards */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -12 }}
              variants={stagger}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {steps.map((step, i) => (
                <StepCard
                  key={step.number}
                  step={step}
                  index={i}
                  isActive={activeStep === i}
                  onClick={() => setActiveStep(i)}
                />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Step nav (mobile) */}
          <div className="flex items-center justify-center gap-3 mt-8 lg:hidden">
            {steps.map((step, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className="w-8 h-1.5 rounded-full transition-all duration-300"
                style={{ background: activeStep === i ? step.accent : "var(--border-card-strong)" }}
              />
            ))}
          </div>

          {/* CTA row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.55 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-16"
          >
            <Link
              href="/auth"
              className="group flex items-center gap-2 px-7 py-4 rounded-2xl font-semibold text-white text-sm transition-all hover:scale-[1.03] hover:opacity-95"
              style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)", boxShadow: "0 0 32px rgba(124,58,237,0.25)" }}
            >
              <Sparkles size={15} />
              Create Your Account
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href={tab === "brands" ? "/for-brands" : "/for-creators"}
              className="flex items-center gap-2 px-6 py-4 rounded-2xl text-sm font-medium transition-all hover:scale-[1.02]"
              style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)", color: "#64748b" }}
            >
              {tab === "brands" ? <Building2 size={14} /> : <Users size={14} />}
              Explore {tab === "brands" ? "Brand" : "Creator"} features
            </Link>
          </motion.div>
        </div>
      </main>

      <div style={{ background: "var(--bg-footer)", borderTop: "1px solid var(--bg-card-hover)" }}>
        <Footer />
      </div>
    </div>
  );
}
