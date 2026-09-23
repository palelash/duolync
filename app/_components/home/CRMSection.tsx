"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  motion,
  useInView,
  animate,
  type Variants,
  type AnimationPlaybackControls,
} from "framer-motion";
import {
  Database,
  FileText,
  Users,
  Rocket,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import techUnboxingImg from "@/assets/tech-unboxing.jpg";
import springCollectionImg from "@/assets/spring-collection.jpg";
import videographyImg from "@/assets/videography.jpg";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const EMERALD = "#34d399";
const EMERALD_T = "var(--accent-emerald-text)";

type DemoPhase = "idle" | "running" | "done";

const campaigns = [
  {
    title: "Tech Unboxing Series",
    creators: 5,
    engagement: "6.2%",
    status: "In Progress",
    statusColor: "var(--accent-amber-text)",
    img: techUnboxingImg,
  },
  {
    title: "Spring Collection Lifestyle",
    creators: 8,
    engagement: "4.8%",
    status: "Review",
    statusColor: "var(--accent-cyan-text)",
    img: springCollectionImg,
  },
  {
    title: "Videography Contest",
    creators: 11,
    engagement: "5.9%",
    status: "Completed",
    statusColor: "var(--accent-emerald-text)",
    img: videographyImg,
  },
];

// [raw target, format fn]
const metrics: { label: string; color: string; target: number; format: (v: number) => string }[] = [
  { label: "Creators", color: "var(--accent-violet-text)",  target: 24, format: (v) => Math.round(v).toString() },
  { label: "Budget",   color: "var(--accent-emerald-text)", target: 45, format: (v) => `$${Math.round(v)}K` },
  { label: "Reach",    color: "var(--accent-cyan-text)",    target: 28, format: (v) => `${(v / 10).toFixed(1)}M` },
];

export function CRMSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  // Store raw numeric values; formatted via metrics[i].format()
  const [metricValues, setMetricValues] = useState([24, 45, 28]);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [showPulse, setShowPulse] = useState(false);

  const animControls = useRef<AnimationPlaybackControls[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    animControls.current.forEach((a) => a.stop());
    animControls.current = [];
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const triggerDemo = useCallback(() => {
    if (demoPhase === "running") return;

    if (demoPhase === "done") {
      clearAll();
      setDemoPhase("idle");
      setMetricValues([24, 45, 28]);
      setSelectedCampaign(null);
      setShowPulse(false);
      return;
    }

    clearAll();
    setDemoPhase("running");
    setMetricValues([0, 0, 0]);
    setSelectedCampaign(null);
    setShowPulse(false);

    // Count up all three metrics simultaneously
    let completedCount = 0;
    const controls = metrics.map(({ target }, i) =>
      animate(0, target, {
        duration: 1.35,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) =>
          setMetricValues((prev) => {
            const next = [...prev];
            next[i] = v;
            return next;
          }),
        onComplete: () => {
          completedCount++;
          if (completedCount === metrics.length) {
            // All counters finished — select campaign + pulse banner
            const t = setTimeout(() => {
              setSelectedCampaign(0);
              setShowPulse(true);
              setDemoPhase("done");
            }, 180);
            timeoutsRef.current.push(t);
          }
        },
      }),
    );
    animControls.current = controls;
  }, [demoPhase, clearAll]);

  const isDemoActive = demoPhase === "running";
  const isDemo = demoPhase !== "idle";

  return (
    <section
      className="py-28 relative overflow-hidden"
      style={{ background: "var(--bg-page)" }}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 left-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--glow-emerald) 0%, transparent 70%)",
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
          {/* Left: content */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <motion.div
                variants={fadeUp}
                transition={{ duration: 0.65 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(52,211,153,0.12)",
                  border: "1px solid rgba(52,211,153,0.35)",
                  color: EMERALD_T,
                }}
              >
                <Database size={11} />
                Campaign Management
              </motion.div>
              <motion.span
                variants={fadeUp}
                transition={{ duration: 0.65 }}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(52,211,153,0.15)", color: EMERALD_T, border: "1px solid rgba(52,211,153,0.35)" }}
              >
                Beta
              </motion.span>
            </div>
            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-5"
            >
              Ditch the{" "}
              <span
                style={{
                  background: `linear-gradient(90deg, ${EMERALD}, #67e8f9)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                spreadsheet.
              </span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="text-slate-400 text-lg leading-relaxed mb-8"
            >
              Enhance your productivity with built-in campaign management. Track
              every creator, deliverable, and collaboration — with clear
              insights at every step.
            </motion.p>

            <motion.ul variants={stagger} className="space-y-4 mb-8">
              {[
                { icon: Users,    text: "Centralized tracking for all your creator partnerships" },
                { icon: FileText, text: "Full partnership history and campaign timeline in one place" },
                { icon: BarChart3, text: "Campaign analytics: reach, engagement, and performance data" },
                { icon: Rocket,   text: "Save time on admin — focus on growing your campaigns" },
              ].map((item, i) => (
                <motion.li
                  key={i}
                  variants={fadeUp}
                  transition={{ duration: 0.5 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: "rgba(52,211,153,0.12)",
                      border: "1px solid rgba(52,211,153,0.25)",
                    }}
                  >
                    <item.icon size={15} style={{ color: EMERALD_T }} />
                  </div>
                  <span className="text-slate-300 text-sm leading-relaxed">
                    {item.text}
                  </span>
                </motion.li>
              ))}
            </motion.ul>

            {/* Desktop button — hidden on mobile */}
            <motion.button
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              onClick={triggerDemo}
              disabled={isDemoActive}
              className="hidden lg:inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
              style={{
                background: isDemoActive
                  ? "rgba(52,211,153,0.25)"
                  : "rgba(52,211,153,0.15)",
                border: isDemoActive
                  ? "1px solid rgba(52,211,153,0.5)"
                  : "1px solid rgba(52,211,153,0.35)",
                color: EMERALD_T,
                opacity: isDemoActive ? 0.75 : 1,
              }}
            >
              {isDemoActive ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Loading data...
                </>
              ) : (
                <>
                  Explore Campaign Tools
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </div>

          {/* Right: Campaign Dashboard */}
          <motion.div variants={fadeUp} transition={{ duration: 0.65 }}>
            <div
              role="img"
              aria-label="Preview of the campaign CRM dashboard tracking creators through each pipeline stage"
              className="rounded-3xl overflow-hidden transition-all duration-500"
              style={{
                background: "var(--bg-card)",
                border: isDemo
                  ? "1px solid rgba(52,211,153,0.35)"
                  : "1px solid var(--border-card-strong)",
                boxShadow: isDemo ? "0 0 48px rgba(52,211,153,0.07)" : "none",
              }}
            >
              {/* Dashboard header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid var(--bg-card-hover)" }}
              >
                <span className="text-sm font-semibold text-white">
                  Campaign Dashboard
                </span>
                <div className="flex gap-2">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ background: "rgba(52,211,153,0.2)", color: "var(--accent-emerald-text)" }}
                  >
                    Active
                  </span>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[10px] text-slate-500"
                    style={{ background: "var(--bg-card-hover)" }}
                  >
                    3 Campaigns
                  </span>
                </div>
              </div>

              {/* Stats grid — animated counters */}
              <div
                className="grid grid-cols-3 gap-px"
                style={{ background: "var(--bg-card-hover)" }}
              >
                {metrics.map((s, i) => (
                  <div
                    key={s.label}
                    className="p-4 text-center"
                    style={{ background: "var(--bg-page)" }}
                  >
                    <div
                      className="text-xl font-bold font-display tabular-nums"
                      style={{ color: s.color }}
                    >
                      {s.format(metricValues[i])}
                    </div>
                    <div className="text-[10px] text-slate-600">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Campaign rows */}
              <div className="p-5 space-y-3">
                {campaigns.map((c, i) => {
                  const isSelected = selectedCampaign === i;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      whileHover={{
                        backgroundColor: isSelected
                          ? "rgba(52,211,153,0.08)"
                          : "rgba(255,255,255,0.025)",
                        transition: { duration: 0.15 },
                      }}
                      transition={{ delay: 0.4 + i * 0.12 }}
                      className="flex items-center gap-3 rounded-2xl p-3.5 cursor-pointer"
                      style={{
                        background: isSelected
                          ? "rgba(52,211,153,0.06)"
                          : "var(--bg-card-subtle)",
                        border: isSelected
                          ? "1px solid rgba(52,211,153,0.3)"
                          : "1px solid var(--border-card)",
                        transition: "background 0.4s ease, border-color 0.4s ease",
                      }}
                    >
                      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                        <Image
                          src={c.img}
                          alt={c.title}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-200 truncate leading-tight">
                          {c.title}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {c.creators} creators · Eng {c.engagement}
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: `color-mix(in srgb, ${c.statusColor} 18%, transparent)`,
                          color: c.statusColor,
                        }}
                      >
                        {c.status}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Performance footer banner */}
              <div className="px-5 pb-4">
                <motion.div
                  animate={
                    showPulse
                      ? { scale: [1, 1.018, 1, 1.012, 1] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 1.1, ease: "easeInOut" }}
                  className="flex items-center gap-2 rounded-xl px-4 py-3"
                  style={{
                    background: showPulse
                      ? "rgba(52,211,153,0.12)"
                      : "var(--glow-emerald)",
                    border: showPulse
                      ? "1px solid rgba(52,211,153,0.4)"
                      : "1px solid rgba(52,211,153,0.15)",
                    transition: "background 0.5s ease, border-color 0.5s ease",
                  }}
                >
                  <BarChart3 size={14} style={{ color: EMERALD_T }} />
                  <span className="text-xs text-slate-400 flex-1">
                    Campaign performance up{" "}
                    <strong style={{ color: EMERALD_T }}>+23%</strong> this month
                  </span>
                  <CheckCircle2 size={13} style={{ color: EMERALD_T }} />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Mobile-only button — appears below the CRM dashboard */}
        <div className="flex lg:hidden mt-6">
          <button
            onClick={triggerDemo}
            disabled={isDemoActive}
            className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{
              background: isDemoActive
                ? "rgba(52,211,153,0.25)"
                : "rgba(52,211,153,0.15)",
              border: isDemoActive
                ? "1px solid rgba(52,211,153,0.5)"
                : "1px solid rgba(52,211,153,0.35)",
              color: EMERALD_T,
              opacity: isDemoActive ? 0.75 : 1,
            }}
          >
            {isDemoActive ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Loading data...
              </>
            ) : (
              <>
                Explore Campaign Tools
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
