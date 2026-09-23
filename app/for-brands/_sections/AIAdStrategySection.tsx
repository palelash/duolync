"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import {
  Brain, Sparkles, ArrowRight, TrendingUp, DollarSign,
  Target, Play, CheckCircle2, Users,
} from "lucide-react";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

type DemoPhase = "idle" | "sending" | "analyzing" | "done";

const adFormats = [
  {
    name: "Storytelling", roi: "3.2×",
    desc: "Authentic narrative-driven content builds emotional connection. Ideal for lifestyle and beauty.",
    color: "var(--accent-violet-text)", bg: "var(--glow-purple)", border: "rgba(124,58,237,0.3)", icon: Play,
  },
  {
    name: "Unboxing", roi: "2.7×",
    desc: "High excitement format that drives impulse purchases. Works best for consumer products.",
    color: "var(--accent-sky-text)", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.3)", icon: Target,
  },
  {
    name: "Comparison", roi: "2.4×",
    desc: "Trust-building format that positions your product favorably against alternatives.",
    color: "var(--accent-emerald-text)", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)", icon: TrendingUp,
  },
];

const strategyContent = [
  {
    userMsg: "We sell premium skincare. Target: women 25–34. TikTok. What ad format?",
    accentColor: "var(--accent-violet-text)", accentBg: "rgba(167,139,250,0.1)", accentBorder: "rgba(167,139,250,0.25)",
    recommendations: [
      { rank: 1, format: "Storytelling (60s reel)",  roi: "3.2×", color: "var(--accent-violet-text)" },
      { rank: 2, format: "Unboxing short (15-30s)",  roi: "2.7×", color: "var(--accent-sky-text)" },
    ],
    analysis: "Based on 2,840 similar campaigns. Storytelling drives 68% higher purchase intent — emotional connection is key for this demographic.",
  },
  {
    userMsg: "New consumer electronics launch. What format converts fastest on TikTok?",
    accentColor: "var(--accent-sky-text)", accentBg: "rgba(56,189,248,0.1)", accentBorder: "rgba(56,189,248,0.25)",
    recommendations: [
      { rank: 1, format: "Unboxing short (15-30s)",   roi: "2.7×", color: "var(--accent-sky-text)" },
      { rank: 2, format: "Comparison reel (30-45s)",  roi: "2.4×", color: "var(--accent-emerald-text)" },
    ],
    analysis: "Short-form unboxing outperforms in impulse-buy categories. Generates 3.1× more shares — ideal for launch momentum and product discovery.",
  },
  {
    userMsg: "We're entering a crowded market. How do we differentiate our ad content?",
    accentColor: "var(--accent-emerald-text)", accentBg: "rgba(52,211,153,0.1)", accentBorder: "rgba(52,211,153,0.25)",
    recommendations: [
      { rank: 1, format: "Comparison breakdown (45s)",    roi: "2.4×", color: "var(--accent-emerald-text)" },
      { rank: 2, format: "Storytelling narrative (60s)",  roi: "2.1×", color: "var(--accent-violet-text)" },
    ],
    analysis: "Feature-to-feature comparisons build trust in competitive markets. 42% higher conversion rate vs. generic ads — viewers self-qualify before clicking.",
  },
];

// Creator profiles the AI recommends per format
const creatorRecs = [
  [
    { handle: "@nova.beauty",  followers: "2.4M", match: 97, platform: "TikTok",     color: "var(--accent-violet-text)", initials: "NB" },
    { handle: "@glow.withme",  followers: "890K", match: 93, platform: "Instagram",  color: "var(--accent-pink-text)", initials: "GW" },
  ],
  [
    { handle: "@techunboxed",  followers: "1.2M", match: 95, platform: "TikTok",     color: "var(--accent-sky-text)", initials: "TU" },
    { handle: "@gadget.drops", followers: "760K", match: 91, platform: "YouTube",    color: "var(--accent-emerald-text)", initials: "GD" },
  ],
  [
    { handle: "@fitlife.co",   followers: "980K", match: 94, platform: "YouTube",    color: "var(--accent-emerald-text)", initials: "FL" },
    { handle: "@vs.reviews",   followers: "640K", match: 89, platform: "TikTok",     color: "var(--accent-amber-text)", initials: "VR" },
  ],
];

// Staggered delays for the demo message slide-ups
const MSG_DELAYS = [0, 0.15, 0.32, 0.5];

export function AIAdStrategySection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [activeFormat, setActiveFormat] = useState(0);
  const [demoPhase, setDemoPhase]       = useState<DemoPhase>("idle");

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const triggerDemo = useCallback(() => {
    if (demoPhase === "sending" || demoPhase === "analyzing") return;
    clearAll();
    setDemoPhase("sending");

    const t1 = setTimeout(() => setDemoPhase("analyzing"), 650);
    const t2 = setTimeout(() => setDemoPhase("done"),      650 + 1500);
    timeoutsRef.current.push(t1, t2);
  }, [demoPhase, clearAll]);

  const handleFormatChange = useCallback((i: number) => {
    clearAll();
    setActiveFormat(i);
    setDemoPhase("idle");
  }, [clearAll]);

  const isDemo    = demoPhase !== "idle";
  const isRunning = demoPhase === "sending" || demoPhase === "analyzing";

  // Key triggers full exit→enter animation on format change AND demo start
  const chatKey = isDemo ? `demo-${activeFormat}` : `idle-${activeFormat}`;
  const sc      = strategyContent[activeFormat];

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      <div
        className="absolute top-1/2 -translate-y-1/2 right-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{ background: "radial-gradient(circle, var(--glow-emerald) 0%, transparent 70%)" }}
      />

      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid lg:grid-cols-2 gap-16 items-center"
        >
          {/* ── Left: copy ── */}
          <div>
            <motion.div variants={fadeUp} className="flex items-center gap-2 mb-5">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", color: "var(--accent-emerald-text)" }}
              >
                <Brain size={11} />
                AI Ad Strategy Advisor
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(52,211,153,0.1)", color: "var(--accent-emerald-text)", border: "1px solid rgba(52,211,153,0.3)" }}
              >
                Beta
              </span>
            </motion.div>

            <motion.h2 variants={fadeUp} className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-5">
              AI-assisted{" "}
              <span style={{ background: "linear-gradient(90deg, #6ee7b7, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                campaign strategy.
              </span>
            </motion.h2>

            <motion.p variants={fadeUp} className="text-slate-400 text-lg leading-relaxed mb-8">
              Describe your product and goals. Our AI advisor suggests ad formats and creator types
              based on your category, target audience, and campaign objective — in seconds.
            </motion.p>

            {/* Format cards */}
            <motion.div variants={stagger} className="space-y-3 mb-8">
              {adFormats.map((format, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all duration-300"
                  style={{
                    background: activeFormat === i ? format.bg : "var(--bg-card-subtle)",
                    border: `1px solid ${activeFormat === i ? format.border : "var(--border-card)"}`,
                  }}
                  onClick={() => handleFormatChange(i)}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: format.bg, border: `1px solid ${format.border}` }}
                  >
                    <format.icon size={16} style={{ color: format.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-semibold text-sm">{format.name}</span>
                      <div className="flex items-center gap-1 text-xs font-bold" style={{ color: format.color }}>
                        <DollarSign size={11} />
                        {format.roi} avg ROI
                      </div>
                    </div>
                    <AnimatePresence>
                      {activeFormat === i && (
                        <motion.p
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="text-slate-400 text-xs leading-relaxed overflow-hidden"
                        >
                          {format.desc}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Desktop button — hidden on mobile */}
            <motion.button
              variants={fadeUp}
              onClick={triggerDemo}
              disabled={isRunning}
              className="hidden lg:flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", color: "var(--accent-emerald-text)" }}
            >
              {isRunning ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                  Advising...
                </>
              ) : (
                <>
                  Try the AI advisor
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </div>

          {/* ── Right: AI chat visual ── */}
          <motion.div variants={fadeUp}>
            <div
              className="rounded-3xl overflow-hidden"
              style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card-strong)" }}
            >
              {/* Chat header */}
              <div
                className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: "1px solid var(--bg-card-hover)", background: "rgba(255,255,255,0.02)" }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                >
                  <Brain size={14} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">AI Strategy Advisor <span className="text-[10px] font-normal text-emerald-400 ml-1">Beta</span></div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online · Ready to advise
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="p-4 min-h-[300px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={chatKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-3"
                  >
                    {/* ── Message 1: user query ── */}
                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: MSG_DELAYS[0], duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="flex justify-end"
                    >
                      <div
                        className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white"
                        style={{ background: "rgba(124,58,237,0.3)", border: "1px solid rgba(124,58,237,0.4)" }}
                      >
                        {sc.userMsg}
                      </div>
                    </motion.div>

                    {/* ── Message 2: AI format recommendation ── */}
                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: MSG_DELAYS[1], duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div
                        className="max-w-[92%] rounded-2xl rounded-tl-sm p-4"
                        style={{ background: sc.accentBg, border: `1px solid ${sc.accentBorder}` }}
                      >
                        <div className="flex items-center gap-1.5 mb-3">
                          <Sparkles size={11} style={{ color: sc.accentColor }} />
                          <span className="text-[10px] font-semibold" style={{ color: sc.accentColor }}>
                            AI RECOMMENDATION
                          </span>
                        </div>
                        <div className="space-y-2">
                          {sc.recommendations.map((item) => (
                            <div key={item.rank} className="flex items-center gap-2">
                              <span
                                className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0"
                                style={{ background: `color-mix(in srgb, ${item.color} 13%, transparent)`, color: item.color }}
                              >
                                {item.rank}
                              </span>
                              <span className="text-slate-200 font-medium text-xs flex-1">{item.format}</span>
                              <span className="text-xs font-bold" style={{ color: item.color }}>{item.roi} ROI</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">{sc.analysis}</p>
                      </div>
                    </motion.div>

                    {/* ── Message 3: follow-up user question ── */}
                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: MSG_DELAYS[2], duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="flex justify-end"
                    >
                      <div
                        className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white"
                        style={{ background: "rgba(124,58,237,0.3)", border: "1px solid rgba(124,58,237,0.4)" }}
                      >
                        Which creators should deliver this?
                      </div>
                    </motion.div>

                    {/* ── Typing indicator (idle: grey / demo: violet) ── */}
                    <AnimatePresence mode="wait">
                      {/* Idle: static grey dots */}
                      {!isDemo && (
                        <motion.div
                          key="idle-dots"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ delay: MSG_DELAYS[3], duration: 0.35 }}
                          className="flex items-center gap-2"
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                          >
                            <Brain size={12} className="text-white" />
                          </div>
                          <div
                            className="flex items-center gap-1 px-3 py-2 rounded-2xl"
                            style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-[10px] text-slate-600">Analyzing creator database...</span>
                        </motion.div>
                      )}

                      {/* Demo analyzing: active violet dots */}
                      {isRunning && (
                        <motion.div
                          key="demo-dots"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          className="flex items-center gap-2"
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                          >
                            <Brain size={12} className="text-white" />
                          </div>
                          <div
                            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl"
                            style={{
                              background: "rgba(124,58,237,0.12)",
                              border: "1px solid rgba(124,58,237,0.3)",
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-[10px] text-violet-400/70">Analyzing creator database...</span>
                        </motion.div>
                      )}

                      {/* Done: creator recommendation card */}
                      {demoPhase === "done" && (
                        <motion.div
                          key="creator-card"
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div
                            className="max-w-[96%] rounded-2xl rounded-tl-sm p-4"
                            style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.28)" }}
                          >
                            {/* Card header */}
                            <div className="flex items-center gap-1.5 mb-3">
                              <Users size={11} className="text-violet-400" />
                              <span className="text-[10px] font-semibold text-violet-300">TOP MATCHED CREATORS</span>
                            </div>

                            {/* Creator rows */}
                            <div className="space-y-2.5">
                              {creatorRecs[activeFormat].map((c, i) => (
                                <motion.div
                                  key={c.handle}
                                  initial={{ opacity: 0, x: -12 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.06 + i * 0.14, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                  className="flex items-center gap-3"
                                >
                                  {/* Gradient avatar */}
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold text-white"
                                    style={{
                                      background: `linear-gradient(135deg, color-mix(in srgb, ${c.color} 56%, transparent), color-mix(in srgb, ${c.color} 19%, transparent))`,
                                      border: `1px solid color-mix(in srgb, ${c.color} 33%, transparent)`,
                                    }}
                                  >
                                    {c.initials}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-white">{c.handle}</div>
                                    <div className="text-[10px] text-slate-500">{c.followers} · {c.platform}</div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div className="text-sm font-bold" style={{ color: c.color }}>{c.match}%</div>
                                    <div className="text-[9px] text-slate-600">match</div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>

                            {/* Footer */}
                            <div
                              className="mt-3 pt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500"
                              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                            >
                              <CheckCircle2 size={10} className="text-emerald-400" />
                              Profiles pre-vetted · Avg. response time 2.4h
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Input area */}
              <div className="px-4 pb-4">
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
                >
                  <input
                    type="text"
                    tabIndex={-1}
                    placeholder="Ask anything about your ad strategy..."
                    className="flex-1 bg-transparent text-xs text-slate-400 placeholder:text-slate-600 focus:outline-none"
                  />
                  <button
                    tabIndex={-1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                  >
                    <ArrowRight size={12} className="text-white" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Mobile-only button — appears below the chat panel */}
        <div className="flex lg:hidden mt-6">
          <button
            onClick={triggerDemo}
            disabled={isRunning}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", color: "var(--accent-emerald-text)" }}
          >
            {isRunning ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                Consulting...
              </>
            ) : (
              <>
                Try the AI advisor
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
