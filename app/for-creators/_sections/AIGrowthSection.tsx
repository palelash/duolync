"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  motion,
  useInView,
  animate,
  AnimatePresence,
  type Variants,
  type AnimationPlaybackControls,
} from "framer-motion";
import {
  Brain,
  Sparkles,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  Loader2,
} from "lucide-react";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const EMERALD = "#34d399";
const VIOLET  = "#c084fc";
const CYAN    = "#67e8f9";
const EMERALD_T = "var(--accent-emerald-text)";
const VIOLET_T  = "var(--accent-purple-text)";
const CYAN_T    = "var(--accent-cyan-text)";

const tipCategories = [
  {
    label: "Engagement", color: EMERALD_T, bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)", icon: TrendingUp,
    tip: "Your Reels posted on Tuesday at 7 PM get 2.4× more saves. Schedule your next brand collab then for max reach.", stat: "+2.4× saves",
  },
  {
    label: "Content Mix", color: VIOLET_T, bg: "rgba(192,132,252,0.12)", border: "rgba(192,132,252,0.3)", icon: BarChart3,
    tip: "You're over-indexing on product showcases (68%). Add more educational content — your audience responds 3× better to tutorials.", stat: "3× better CTR",
  },
  {
    label: "Best Time", color: CYAN_T, bg: "rgba(103,232,249,0.12)", border: "rgba(103,232,249,0.3)", icon: Clock,
    tip: "Your YouTube Shorts get 40% more views when published on Friday between 3–5 PM. Your current timing is off by 2 hours.", stat: "+40% views",
  },
  {
    label: "Growth", color: "var(--accent-amber-text)", bg: "rgba(252,211,77,0.12)", border: "rgba(252,211,77,0.3)", icon: Target,
    tip: "Creators with your profile score hit 50K in avg. 4.2 months. Your current pace puts you there in 6.1 months — here's how to close the gap.", stat: "On track",
  },
];

const audienceStats = [
  { label: "Avg. Engagement", value: "4.2%",   change: "+0.8%",       positive: true, color: EMERALD_T, numeric: 4.2,  format: (v: number) => `${v.toFixed(1)}%`    },
  { label: "Follower Growth",  value: "+12%",   change: "vs last month", positive: true, color: VIOLET_T,  numeric: 12,   format: (v: number) => `+${Math.round(v)}%`  },
  { label: "Profile Score",    value: "78/100", change: "Top 15%",       positive: true, color: CYAN_T,    numeric: 78,   format: (v: number) => `${Math.round(v)}/100` },
];

const chartBars = [
  { label: "Tutorial / Educational", value: 78, color: EMERALD_T },
  { label: "Brand Collaboration",    value: 62, color: VIOLET_T  },
  { label: "Behind the Scenes",      value: 54, color: CYAN_T    },
  { label: "Product Showcase",       value: 41, color: "var(--accent-amber-text)" },
];

const demoInsight = {
  stat: "↑ Priority Action",
  tip: "Your engagement spikes 3× on Friday evenings. Scheduling your next brand collab on Friday at 7PM could lift campaign ROI by an estimated +40%.",
  color: EMERALD_T,
  border: "rgba(52,211,153,0.3)",
};

type DemoPhase = "idle" | "running" | "done";

export function AIGrowthSection() {
  const ref     = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [activeTab, setActiveTab] = useState(0);

  // Demo state
  const [demoPhase,       setDemoPhase]       = useState<DemoPhase>("idle");
  const [metricValues,    setMetricValues]    = useState<string[] | null>(null);
  const [barWidths,       setBarWidths]       = useState(chartBars.map((b) => b.value));
  const [priorityGlowing, setPriorityGlowing] = useState(false);
  const [showDemoInsight, setShowDemoInsight] = useState(false);

  const timeoutsRef  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animCtrlsRef = useRef<AnimationPlaybackControls[]>([]);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    animCtrlsRef.current.forEach((a) => a.stop());
    animCtrlsRef.current = [];
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const resetDemo = useCallback(() => {
    clearAll();
    setDemoPhase("idle");
    setMetricValues(null);
    setBarWidths(chartBars.map((b) => b.value));
    setPriorityGlowing(false);
    setShowDemoInsight(false);
  }, [clearAll]);

  const triggerDemo = useCallback(() => {
    if (demoPhase === "running") return;
    if (demoPhase === "done") { resetDemo(); return; }

    clearAll();
    setDemoPhase("running");
    setPriorityGlowing(false);
    setShowDemoInsight(false);

    // ── Step 1: Reset metrics to "0" strings + count up ─────────────────────
    setMetricValues(audienceStats.map((s) => s.format(0)));

    const ctrls = audienceStats.map((s, i) =>
      animate(0, s.numeric, {
        duration: 1.3,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) =>
          setMetricValues((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            next[i] = s.format(v);
            return next;
          }),
      }),
    );
    animCtrlsRef.current = ctrls;

    // ── Step 2: Reset bars to 0, then animate them up (staggered) ───────────
    setBarWidths([0, 0, 0, 0]);

    chartBars.forEach(({ value }, i) => {
      const t = setTimeout(() => {
        setBarWidths((prev) => {
          const next = [...prev];
          next[i] = value;
          return next;
        });
      }, 900 + i * 200);
      timeoutsRef.current.push(t);
    });

    // ── Step 3: Priority card scanning glow ─────────────────────────────────
    const tGlow = setTimeout(() => setPriorityGlowing(true), 2200);
    timeoutsRef.current.push(tGlow);

    // ── Step 4: AI Insight card swaps to new personalized tip ────────────────
    const tInsight = setTimeout(() => setShowDemoInsight(true), 2800);
    timeoutsRef.current.push(tInsight);

    // ── Step 5: Done ─────────────────────────────────────────────────────────
    const tDone = setTimeout(() => setDemoPhase("done"), 3600);
    timeoutsRef.current.push(tDone);
  }, [demoPhase, clearAll, resetDemo]);

  const isDemoActive = demoPhase === "running";
  const isDemoLocked = demoPhase !== "idle";
  const isDemo       = demoPhase !== "idle";

  // Active insight: demo override or user-selected tab
  const activeInsight = showDemoInsight
    ? demoInsight
    : {
        stat:   `AI INSIGHT · ${tipCategories[activeTab].stat}`,
        tip:    tipCategories[activeTab].tip,
        color:  tipCategories[activeTab].color,
        border: tipCategories[activeTab].border,
      };

  return (
    <section
      className="py-28 relative overflow-hidden"
      style={{ background: "var(--bg-page-alt)" }}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 left-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--glow-emerald) 0%, transparent 70%)",
        }}
      />

      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid lg:grid-cols-2 gap-16 items-center"
        >
          {/* ── Left: content ────────────────────────────────────────────── */}
          <div>
            <motion.div variants={fadeUp} transition={{ duration: 0.65 }} className="flex items-center gap-2 mb-5">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(52,211,153,0.12)",
                  border: "1px solid rgba(52,211,153,0.35)",
                  color: EMERALD_T,
                }}
              >
                <Brain size={11} />
                AI Growth Tools
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(52,211,153,0.1)", color: EMERALD_T, border: "1px solid rgba(52,211,153,0.3)" }}
              >
                Beta
              </span>
            </motion.div>

            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-5"
            >
              AI insights for your{" "}
              <span
                style={{
                  background: `linear-gradient(90deg, ${EMERALD}, ${CYAN})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                content growth.
              </span>
            </motion.h2>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="text-slate-400 text-lg leading-relaxed mb-8"
            >
              Connect your social accounts and get data-driven insights into your
              content performance — helping you understand what works, when to post,
              and what kinds of brand deals to pursue. Currently in beta.
            </motion.p>

            {/* Category tabs */}
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="flex flex-wrap gap-2 mb-4"
            >
              {tipCategories.map((cat, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveTab(i); setShowDemoInsight(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-11 rounded-xl text-xs font-medium transition-all duration-200"
                  style={{
                    background: activeTab === i ? cat.bg : "var(--bg-card-hover)",
                    border: `1px solid ${activeTab === i ? cat.border : "var(--border-card)"}`,
                    color: activeTab === i ? cat.color : "var(--text-muted)",
                  }}
                >
                  <cat.icon size={11} />
                  {cat.label}
                </button>
              ))}
            </motion.div>

            {/* AI Insight card — swaps on demo completion */}
            <AnimatePresence mode="wait">
              <motion.div
                key={showDemoInsight ? "demo-insight" : String(activeTab)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
                className="rounded-2xl p-4 mb-8"
                style={{
                  background: `color-mix(in srgb, ${activeInsight.color} 6%, transparent)`,
                  border: `1px solid ${activeInsight.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} style={{ color: activeInsight.color }} />
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: activeInsight.color }}
                  >
                    {showDemoInsight
                      ? `AI INSIGHT · ${activeInsight.stat}`
                      : `AI INSIGHT · ${tipCategories[activeTab].stat}`}
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {activeInsight.tip}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Desktop button — hidden on mobile */}
            <motion.button
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              onClick={triggerDemo}
              disabled={isDemoActive}
              className="hidden lg:flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
              style={{
                background: isDemoLocked
                  ? "rgba(52,211,153,0.25)"
                  : "rgba(52,211,153,0.15)",
                border: isDemoLocked
                  ? "1px solid rgba(52,211,153,0.5)"
                  : "1px solid rgba(52,211,153,0.35)",
                color: EMERALD_T,
                opacity: isDemoActive ? 0.75 : 1,
              }}
            >
              {isDemoActive ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Get my AI growth plan
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </div>

          {/* ── Right: AI dashboard visual ────────────────────────────────── */}
          <motion.div variants={fadeUp} transition={{ duration: 0.65 }}>
            <div
              className="rounded-3xl overflow-hidden transition-all duration-500"
              style={{
                background: "var(--bg-card)",
                border: isDemo
                  ? "1px solid rgba(52,211,153,0.35)"
                  : "1px solid var(--border-card-strong)",
                boxShadow: isDemo ? "0 0 48px rgba(52,211,153,0.07)" : "none",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-5 py-4"
                style={{
                  borderBottom: "1px solid var(--bg-card-hover)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
                >
                  <Brain size={14} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">AI Growth Tools <span className="text-[10px] font-normal text-emerald-400 ml-1">Beta</span></div>
                  <div
                    className="flex items-center gap-1.5 text-[10px]"
                    style={{ color: EMERALD_T }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: EMERALD }}
                    />
                    {isDemoActive ? "Running full analysis…" : "Analyzing your last 30 days"}
                  </div>
                </div>
              </div>

              {/* Metric counters */}
              <div
                className="grid grid-cols-3 gap-px"
                style={{ background: "var(--bg-card-hover)" }}
              >
                {audienceStats.map((s, i) => (
                  <div
                    key={i}
                    className="p-4 text-center"
                    style={{ background: "var(--bg-page-alt)" }}
                  >
                    <div
                      className="text-lg font-bold font-display tabular-nums"
                      style={{ color: s.color }}
                    >
                      {metricValues ? metricValues[i] : s.value}
                    </div>
                    <div className="text-[9px] text-slate-500 mb-0.5">{s.label}</div>
                    <div
                      className="text-[9px] font-medium"
                      style={{ color: s.positive ? "var(--accent-emerald-text)" : "var(--accent-red-text)" }}
                    >
                      {s.change}
                    </div>
                  </div>
                ))}
              </div>

              {/* Engagement bars */}
              <div className="p-5">
                <div className="text-[11px] font-semibold text-slate-500 mb-3">
                  Engagement by content type
                </div>
                <div className="space-y-2.5">
                  {chartBars.map((item, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-500">{item.label}</span>
                        <span className="font-medium" style={{ color: item.color }}>
                          {item.value}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full"
                        style={{ background: "var(--bg-card-hover)" }}
                      >
                        <motion.div
                          className="h-1.5 rounded-full"
                          animate={{ width: `${barWidths[i]}%` }}
                          transition={{
                            duration: 0.9,
                            ease: [0.22, 1, 0.36, 1],
                            delay: isDemo ? i * 0.12 : 0,
                          }}
                          style={{ background: item.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* THIS WEEK'S PRIORITY — scanning glow */}
                <div className="mt-4 relative">
                  <motion.div
                    className="rounded-2xl p-4 relative overflow-hidden"
                    style={{
                      background: "rgba(52,211,153,0.1)",
                      border: `1px solid ${priorityGlowing ? "rgba(52,211,153,0.5)" : "rgba(52,211,153,0.25)"}`,
                      transition: "border-color 0.4s ease",
                    }}
                  >
                    {/* Scanning glow overlay */}
                    <AnimatePresence>
                      {priorityGlowing && (
                        <motion.div
                          key="glow"
                          className="absolute inset-0 rounded-2xl pointer-events-none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 0.7, 0.3, 0.6, 0] }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 2.2, ease: "easeInOut" }}
                          style={{
                            background:
                              "radial-gradient(ellipse at 50% 0%, rgba(52,211,153,0.3) 0%, transparent 70%)",
                          }}
                        />
                      )}
                    </AnimatePresence>

                    {/* Scan line sweep */}
                    <AnimatePresence>
                      {priorityGlowing && (
                        <motion.div
                          key="scan-line"
                          className="absolute left-0 right-0 h-px pointer-events-none"
                          style={{ background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.6), transparent)" }}
                          initial={{ top: "0%", opacity: 0 }}
                          animate={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
                          transition={{ duration: 1.4, ease: "easeInOut" }}
                        />
                      )}
                    </AnimatePresence>

                    <div className="flex items-center gap-1.5 mb-2 relative">
                      <Sparkles size={11} className="text-emerald-400" />
                      <span className="text-[10px] font-semibold text-emerald-400">
                        THIS WEEK&apos;S PRIORITY
                      </span>
                      {priorityGlowing && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(52,211,153,0.2)", color: EMERALD_T }}
                        >
                          ✦ Just generated
                        </motion.span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed relative">
                      Post <strong>2 tutorial-style Reels</strong> this week. Your tutorials get
                      3× more saves and attract higher-quality brand partnerships in your niche.
                    </p>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Mobile-only button — appears below the dashboard */}
        <div className="flex lg:hidden mt-6">
          <button
            onClick={triggerDemo}
            disabled={isDemoActive}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{
              background: isDemoLocked
                ? "rgba(52,211,153,0.25)"
                : "rgba(52,211,153,0.15)",
              border: isDemoLocked
                ? "1px solid rgba(52,211,153,0.5)"
                : "1px solid rgba(52,211,153,0.35)",
              color: EMERALD_T,
              opacity: isDemoActive ? 0.75 : 1,
            }}
          >
            {isDemoActive ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                Get my AI growth plan
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
