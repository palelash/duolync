"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import {
  Map, Sparkles, ArrowRight, CheckCircle2, Lock,
  Star, TrendingUp, DollarSign, Users, Zap, X, Mail,
} from "lucide-react";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const AMBER   = "#fcd34d";
const PINK    = "#f472b6";
const VIOLET  = "#c084fc";
const EMERALD = "#34d399";
const AMBER_T   = "var(--accent-amber-text)";
const PINK_T    = "var(--accent-pink-text)";
const VIOLET_T  = "var(--accent-purple-text)";
const EMERALD_T = "var(--accent-emerald-text)";

const roadmapSteps = [
  {
    phase: "Phase 1", title: "Foundation", milestone: "0 → 1K Followers",
    color: PINK_T, bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.25)", done: true,
    tasks: ["Profile audit & optimization", "Niche identification", "Content pillars defined", "First 10 posts published"],
  },
  {
    phase: "Phase 2", title: "Momentum", milestone: "1K → 10K Followers",
    color: VIOLET_T, bg: "rgba(192,132,252,0.1)", border: "rgba(192,132,252,0.25)", done: false, active: true,
    tasks: ["Consistency streak: 3×/week", "Engagement strategy active", "First brand pitch sent", "Media kit created"],
  },
  {
    phase: "Phase 3", title: "Monetization", milestone: "First Paid Deal",
    color: AMBER_T, bg: "rgba(252,211,77,0.1)", border: "rgba(252,211,77,0.25)", done: false,
    tasks: ["Brand pitch templates", "Rate card established", "First $500+ deal signed", "Deal tracking setup in Duolync"],
  },
  {
    phase: "Phase 4", title: "Scale", milestone: "10K → 100K",
    color: EMERALD_T, bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.25)", done: false,
    tasks: ["Multi-platform expansion", "Premium brand deals $2K+", "Content team building", "Passive income streams"],
  },
];

const proStats = [
  { icon: Users,     value: "Grow",     label: "your audience systematically", color: PINK_T    },
  { icon: DollarSign, value: "Land",    label: "your first paid brand deal",   color: AMBER_T   },
  { icon: TrendingUp, value: "Scale",   label: "with data-driven insights",    color: EMERALD_T },
];

function RoadmapModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const params = new URLSearchParams({ email: email.trim(), role: "creator" });
    router.push(`/auth?${params.toString()}`);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}
        onClick={onClose}
      >
        {/* Modal card — stop propagation so clicking inside doesn't close */}
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md rounded-3xl p-8 overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(15,15,20,0.98) 0%, rgba(20,12,30,0.98) 100%)",
            border: "1px solid rgba(244,114,182,0.25)",
            boxShadow: "0 0 80px rgba(217,119,6,0.12), 0 0 0 1px rgba(255,255,255,0.04) inset",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ambient top glow */}
          <div
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full blur-[60px] pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(217,119,6,0.25) 0%, rgba(219,39,119,0.15) 60%, transparent 100%)" }}
          />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <X size={14} className="text-slate-400" />
          </button>

          <AnimatePresence mode="wait">
            {true ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {/* Icon */}
                <div className="flex items-center justify-center mb-5">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, rgba(217,119,6,0.3), rgba(219,39,119,0.3))", border: "1px solid rgba(244,114,182,0.3)" }}
                  >
                    <Sparkles size={22} style={{ color: AMBER_T }} />
                  </div>
                </div>

                {/* Heading */}
                <h3 className="font-display font-bold text-white text-2xl text-center leading-snug mb-3">
                  Start Your Creator Journey 🚀
                </h3>

                {/* Sub */}
                <p className="text-slate-400 text-sm text-center leading-relaxed mb-6">
                  Enter your email to create your Duolync account and unlock your personalized AI-powered growth roadmap and brand deal pipeline.
                </p>

                {/* Proof bar */}
                <div
                  className="flex items-center justify-center gap-4 mb-6 py-2.5 px-4 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex -space-x-2">
                    {["#f472b6", "#c084fc", "#67e8f9", "#34d399"].map((c, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full border-2"
                        style={{ background: c, borderColor: "rgba(15,15,20,0.98)" }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Creators already building their portfolios on Duolync
                  </span>
                  <div className="flex">
                    {"★★★★★".split("").map((s, i) => (
                      <span key={i} className="text-amber-400 text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200 focus-within:border-pink-500/50"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Mail size={14} className="text-slate-600 shrink-0" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:scale-[1.02] hover:opacity-95 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #d97706, #db2777)" }}
                  >
                    Sign Up Free
                    <span className="ml-2">→</span>
                  </button>
                </form>

                <p className="text-center text-[10px] text-slate-700 mt-4">
                  No credit card required. Cancel any time.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="text-center py-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", bounce: 0.5 }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)" }}
                >
                  <CheckCircle2 size={28} style={{ color: EMERALD_T }} />
                </motion.div>
                <h3 className="font-display font-bold text-white text-xl mb-2">
                  You&apos;re on the list! 🎉
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  We&apos;ll send your personalized growth blueprint to{" "}
                  <strong className="text-white">{email}</strong> as soon as beta opens.
                </p>
                <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: EMERALD_T }}>
                  <Star size={10} fill={EMERALD} />
                  <span>Expected access: within 48 hours</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </>
  );
}

export function RoadmapSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <section
        className="py-28 relative overflow-hidden"
        style={{ background: "var(--bg-page)" }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[180px]"
            style={{
              background:
                "radial-gradient(circle, var(--glow-amber) 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="container mx-auto px-4">
          {/* Section header */}
          <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5"
              style={{
                background: "rgba(252,211,77,0.12)",
                border: "1px solid rgba(252,211,77,0.35)",
                color: AMBER_T,
              }}
            >
              <Map size={11} />
              The &quot;Newbie to Pro&quot; Roadmap
            </motion.div>
            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.6 }}
              className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-4"
            >
              Just starting?{" "}
              <span
                style={{
                  background: `linear-gradient(90deg, ${AMBER}, ${PINK})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                We&apos;ve got you.
              </span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.6 }}
              className="text-slate-400 max-w-xl mx-auto text-lg"
            >
              Our AI-driven roadmap guides you step-by-step from zero to your first
              10K followers and your first paid brand deal — no guesswork, no fluff.
            </motion.p>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
            className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-16"
          >
            {proStats.map((s, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={{ duration: 0.6 }}
                className="text-center p-4 rounded-2xl"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)" }}
              >
                <s.icon size={16} className="mx-auto mb-2" style={{ color: s.color }} />
                <div
                  className="text-xl font-bold font-display"
                  style={{ color: s.color }}
                >
                  {s.value}
                </div>
                <div className="text-[10px] text-slate-500 leading-snug mt-0.5">
                  {s.label}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Roadmap phases */}
          <motion.div
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16"
          >
            {roadmapSteps.map((step, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={{ duration: 0.6 }}
                className="rounded-3xl p-5 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: step.active ? step.bg : "var(--bg-card)",
                  border: `1px solid ${step.active ? step.border : "var(--border-card)"}`,
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `color-mix(in srgb, ${step.color} 9%, transparent)`, color: step.color }}
                  >
                    {step.phase}
                  </span>
                  {step.done ? (
                    <CheckCircle2 size={16} style={{ color: step.color }} />
                  ) : step.active ? (
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: `color-mix(in srgb, ${step.color} 19%, transparent)`, border: `1px solid ${step.color}` }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ background: step.color }}
                      />
                    </div>
                  ) : (
                    <Lock size={13} className="text-slate-700" />
                  )}
                </div>

                <div className="mb-1">
                  <div className="font-display font-bold text-white text-lg leading-tight">
                    {step.title}
                  </div>
                  <div className="text-xs font-medium" style={{ color: step.color }}>
                    {step.milestone}
                  </div>
                </div>

                <ul className="mt-4 space-y-1.5">
                  {step.tasks.map((task, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-1.5 text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <div
                        className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                        style={{ background: step.done || step.active ? step.color : "#374151" }}
                      />
                      {task}
                    </li>
                  ))}
                </ul>

                {step.active && (
                  <div
                    className="mt-4 flex items-center gap-1.5 text-[10px] font-bold"
                    style={{ color: step.color }}
                  >
                    <Zap size={10} />
                    YOU ARE HERE
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Bottom AI callout */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.8, duration: 0.7 }}
            className="max-w-2xl mx-auto rounded-3xl p-8 text-center"
            style={{
              background: "rgba(252,211,77,0.06)",
              border: "1px solid rgba(252,211,77,0.2)",
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles size={16} style={{ color: AMBER_T }} />
              <span className="text-sm font-semibold" style={{ color: AMBER_T }}>
                AI-Personalized Roadmap
              </span>
            </div>
            <h3 className="font-display font-bold text-white text-2xl mb-3">
              Not a generic checklist.
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-5">
              Your roadmap is built specifically for your niche, current follower count,
              and content style. The AI adapts your milestones in real-time as you grow
              — so you&apos;re always taking the right next step.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:scale-[1.02] hover:opacity-95 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #d97706, #db2777)" }}
            >
              Get my personalized roadmap
              <ArrowRight size={15} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Modal — rendered in a portal-like position via AnimatePresence */}
      <AnimatePresence>
        {isModalOpen && <RoadmapModal onClose={() => setIsModalOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
