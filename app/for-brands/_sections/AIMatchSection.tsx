"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import {
  Sparkles, Search, TrendingUp, Star, Users,
  Target, ArrowRight, CheckCircle2,
} from "lucide-react";
import Image from "next/image";
import novaBeautyImg from "@/assets/nova.beauty.png";
import styleWorldImg from "@/assets/style.world.jpg";
import fitlifeImg from "@/assets/fitlife.jpg";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const QUERY = "Skincare brand targeting 25-34F with $50+ AOV...";
const FINAL_BARS = [94, 89, 97, 92];
type DemoPhase = "idle" | "typing" | "results";

const creators = [
  {
    name: "@nova.beauty", niche: "Beauty", followers: "2.4M", engRate: "5.2%", match: 96,
    img: novaBeautyImg, tags: ["Skincare", "Makeup", "Tutorials"],
  },
  {
    name: "@style.world", niche: "Fashion", followers: "1.8M", engRate: "4.8%", match: 91,
    img: styleWorldImg, tags: ["Street Style", "Hauls", "OOTDs"],
  },
  {
    name: "@fitlife.co", niche: "Wellness", followers: "980K", engRate: "7.1%", match: 88,
    img: fitlifeImg, tags: ["Fitness", "Nutrition", "Health"],
  },
];

const aiInsights = [
  { label: "Audience-brand fit",     value: 94, color: "var(--accent-violet-text)" },
  { label: "Engagement quality",     value: 97, color: "var(--accent-emerald-text)" },
  { label: "Niche relevance",        value: 92, color: "var(--accent-amber-text)" },
  { label: "Audience authenticity",  value: 89, color: "var(--accent-sky-text)" },
];

export function AIMatchSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [demoPhase, setDemoPhase]       = useState<DemoPhase>("idle");
  const [typedText, setTypedText]       = useState("");
  const [showCursor, setShowCursor]     = useState(false);
  const [showFilters, setShowFilters]   = useState(true);
  const [revealedCount, setRevealedCount] = useState(3);
  const [barWidths, setBarWidths]       = useState<number[]>(FINAL_BARS);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const push = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeoutsRef.current.push(t);
  };

  const triggerDemo = useCallback(() => {
    if (demoPhase === "typing") return;
    clearAll();

    setDemoPhase("typing");
    setTypedText("");
    setShowCursor(true);
    setShowFilters(false);
    setRevealedCount(0);
    setBarWidths([0, 0, 0, 0]);

    let idx = 0;
    intervalRef.current = setInterval(() => {
      idx++;
      setTypedText(QUERY.slice(0, idx));
      if (idx >= QUERY.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setShowCursor(false);

        push(() => setShowFilters(true),      350);
        push(() => setRevealedCount(1),        620);
        push(() => setRevealedCount(2),        880);
        push(() => setRevealedCount(3),       1140);
        push(() => {
          setBarWidths(FINAL_BARS);
          setDemoPhase("results");
        }, 1380);
      }
    }, 35);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPhase, clearAll]);

  const isDemo = demoPhase !== "idle";

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      <div
        className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{ background: "radial-gradient(circle, var(--glow-purple) 0%, transparent 70%)" }}
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
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5"
              style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.35)", color: "var(--accent-violet-text)" }}
            >
              <Sparkles size={11} />
              AI Smart Search &amp; Matching
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-5"
            >
              Your AI{" "}
              <span style={{ background: "linear-gradient(90deg, #a78bfa, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                matchmaker
              </span>{" "}
              for creator partnerships.
            </motion.h2>

            <motion.p variants={fadeUp} className="text-slate-400 text-lg leading-relaxed mb-8">
              Our matching system analyses your brand category and campaign goals, then cross-references
              creator audience data to surface the most relevant partnerships for your product.
            </motion.p>

            <motion.ul variants={stagger} className="space-y-4 mb-8">
              {[
                { icon: Target,    text: "Audience-to-brand affinity scoring based on niche, demographics, and engagement" },
                { icon: TrendingUp, text: "Engagement quality analysis to filter for authentic audiences" },
                { icon: Star,      text: "Creator verification to surface only public, accessible accounts" },
                { icon: Users,     text: "Cross-platform discovery: TikTok, Instagram, YouTube" },
              ].map((item, i) => (
                <motion.li key={i} variants={fadeUp} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}
                  >
                    <item.icon size={15} style={{ color: "var(--accent-violet-text)" }} />
                  </div>
                  <span className="text-slate-300 text-sm leading-relaxed">{item.text}</span>
                </motion.li>
              ))}
            </motion.ul>

            {/* Desktop button — hidden on mobile */}
            <motion.button
              variants={fadeUp}
              onClick={triggerDemo}
              disabled={demoPhase === "typing"}
              className="hidden lg:flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.4)", color: "var(--accent-violet-text)" }}
            >
              {demoPhase === "typing" ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  See how it works
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </div>

          {/* ── Right: live dashboard ── */}
          <motion.div variants={fadeUp} className="relative">

            {/* Search bar */}
            <div
              className="rounded-2xl p-4 mb-4"
              style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card-strong)" }}
            >
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
              >
                <Search size={15} className="text-slate-600 shrink-0" />
                <span
                  className="text-sm flex-1 min-h-[1.25rem]"
                  style={{ color: isDemo ? "#e2e8f0" : "var(--text-muted)" }}
                >
                  {isDemo ? typedText : QUERY}
                  {showCursor && (
                    <span className="inline-block w-0.5 h-3.5 bg-violet-400 ml-0.5 align-middle animate-pulse" />
                  )}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded font-medium shrink-0"
                  style={{ background: "rgba(124,58,237,0.25)", color: "var(--accent-violet-text)" }}
                >
                  AI
                </span>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-2 mt-2 px-1 min-h-[1.5rem]">
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      key="pills"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-[10px] text-slate-600">Filters:</span>
                      {["Engagement >4%", "100K–5M followers", "Female majority"].map((f, i) => (
                        <motion.span
                          key={f}
                          initial={{ opacity: 0, scale: 0.82 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.22, delay: i * 0.07 }}
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)", border: "1px solid var(--bg-card-hover)" }}
                        >
                          {f}
                        </motion.span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Creator result cards */}
            <div className="space-y-3">
              {creators.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={
                    isDemo
                      ? { opacity: i < revealedCount ? 1 : 0, y: i < revealedCount ? 0 : 14, x: 0 }
                      : { opacity: isInView ? 1 : 0, x: isInView ? 0 : 20, y: 0 }
                  }
                  transition={{
                    duration: 0.45,
                    ease: [0.22, 1, 0.36, 1],
                    delay: isDemo ? 0 : 0.4 + i * 0.15,
                  }}
                  className="rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 hover:scale-[1.01] cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.035)", border: "1px solid var(--border-card-strong)" }}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0">
                    <Image src={c.img} alt={c.name} width={48} height={48} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white font-medium text-sm">{c.name}</span>
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1.5">
                      <span>{c.followers}</span>
                      <span>·</span>
                      <span>Eng {c.engRate}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded-full text-[9px]"
                          style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-center">
                    <div className="text-lg font-bold text-emerald-400">{c.match}%</div>
                    <div className="text-[9px] text-slate-600">Match</div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* AI Analysis panel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.9, duration: 0.6 }}
              className="mt-4 rounded-2xl p-4"
              style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.2)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={13} className="text-violet-400" />
                <span className="text-xs font-medium text-violet-300">AI Analysis — @nova.beauty</span>
              </div>
              <div className="space-y-2">
                {aiInsights.map((insight, i) => (
                  <div key={insight.label}>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-500">{insight.label}</span>
                      <span className="font-medium" style={{ color: insight.color }}>{insight.value}%</span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: "var(--bg-card-hover)" }}>
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: isDemo
                            ? `${barWidths[i]}%`
                            : (isInView ? `${insight.value}%` : "0%"),
                          background: insight.color,
                          transition: `width ${isDemo && barWidths[i] === 0 ? 0 : 950}ms ease`,
                          transitionDelay: isDemo && barWidths[i] > 0 ? `${i * 160}ms` : "0ms",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Mobile-only button — appears below the dashboard */}
        <div className="flex lg:hidden mt-6">
          <button
            onClick={triggerDemo}
            disabled={demoPhase === "typing"}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.4)", color: "var(--accent-violet-text)" }}
          >
            {demoPhase === "typing" ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                See how it works
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
