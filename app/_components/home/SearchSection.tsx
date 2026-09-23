"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import {
  Search,
  CheckCircle2,
  ArrowRight,
  Instagram,
  Youtube,
  Twitter,
  Sparkles,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import liamImg from "@/assets/liam.jpg";
import aishaImg from "@/assets/aisha.jpg";
import marcusImg from "@/assets/marucs.jpg";
import techSophieImg from "@/assets/tech-sophie.jpg";
import techKaiImg from "@/assets/tech-kai.jpg";
import techElenaImg from "@/assets/tech elena.jpg";
import type { StaticImageData } from "next/image";

type CreatorCard = {
  name: string;
  handle: string;
  niche: string;
  followers: string;
  match: number;
  img?: StaticImageData;
  gradient?: string;
  initials?: string;
  objectPosition?: string;
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const PURPLE = "#a78bfa";
const CYAN = "#67e8f9";
const PURPLE_T = "var(--accent-violet-text)";
const DEMO_QUERY = "Tech influencers in Europe";

type DemoPhase = "idle" | "typing" | "loading" | "results";

const creators: CreatorCard[] = [
  {
    name: "Liam S.",
    handle: "@TheTechLiam",
    niche: "Tech",
    followers: "55K",
    match: 91,
    img: liamImg,
  },
  {
    name: "Aisha K.",
    handle: "@StyleAisha",
    niche: "Fashion",
    followers: "120K",
    match: 93,
    img: aishaImg,
  },
  {
    name: "Marcus V.",
    handle: "@UrbanMotion",
    niche: "Video",
    followers: "88K",
    match: 89,
    img: marcusImg,
  },
];

const demoCreators: CreatorCard[] = [
  {
    name: "Sophie H.",
    handle: "@EuroTechSophie",
    niche: "Tech",
    followers: "210K",
    match: 98,
    img: techSophieImg,
  },
  {
    name: "Kai M.",
    handle: "@TechKaiEU",
    niche: "Tech",
    followers: "178K",
    match: 96,
    img: techKaiImg,
    objectPosition: "50% 15%",
  },
  {
    name: "Elena V.",
    handle: "@EuroTechElena",
    niche: "Tech",
    followers: "145K",
    match: 97,
    img: techElenaImg,
  },
];

const platforms = [
  { name: "Instagram", color: "#e1306c", text: "var(--brand-instagram-text)", bg: "rgba(225,48,108,0.15)" },
  { name: "YouTube", color: "#ff0000", text: "var(--brand-youtube-text)", bg: "rgba(255,0,0,0.12)" },
  { name: "TikTok", color: "#f472b6", text: "var(--brand-tiktok-text)", bg: "rgba(244,114,182,0.15)" },
  { name: "Twitter", color: "#1da1f2", text: "var(--brand-twitter-text)", bg: "rgba(29,161,242,0.15)" },
  { name: "Twitch", color: "#9146ff", bg: "rgba(145,70,255,0.15)" },
];

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-card-hover)",
        border: "1px solid var(--border-card)",
      }}
    >
      <div
        className="h-20 w-full animate-pulse"
        style={{ background: "rgba(148,163,184,0.08)" }}
      />
      <div className="p-2 space-y-1.5">
        <div
          className="h-2.5 w-3/4 rounded-full animate-pulse"
          style={{ background: "rgba(148,163,184,0.1)" }}
        />
        <div
          className="h-2 w-1/2 rounded-full animate-pulse"
          style={{ background: "rgba(148,163,184,0.07)" }}
        />
        <div className="flex justify-between mt-1.5">
          <div
            className="h-2 w-7 rounded-full animate-pulse"
            style={{ background: "rgba(148,163,184,0.07)" }}
          />
          <div
            className="h-2 w-7 rounded-full animate-pulse"
            style={{ background: "rgba(148,163,184,0.07)" }}
          />
        </div>
      </div>
    </div>
  );
}

export function SearchSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [query, setQuery] = useState("");
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (demoPhase !== "typing") {
      setShowCursor(true);
      return;
    }
    const id = setInterval(() => setShowCursor((p) => !p), 530);
    return () => clearInterval(id);
  }, [demoPhase]);

  const triggerDemo = useCallback(() => {
    if (demoPhase === "typing" || demoPhase === "loading") return;

    if (demoPhase === "results") {
      setDemoPhase("idle");
      setTypedText("");
      return;
    }

    clearTimers();
    setDemoPhase("typing");
    setTypedText("");

    let charIndex = 0;
    intervalRef.current = setInterval(() => {
      charIndex++;
      setTypedText(DEMO_QUERY.slice(0, charIndex));
      if (charIndex >= DEMO_QUERY.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        const t1 = setTimeout(() => {
          setDemoPhase("loading");
          const t2 = setTimeout(() => {
            setDemoPhase("results");
          }, 1300);
          timeoutsRef.current.push(t2);
        }, 500);
        timeoutsRef.current.push(t1);
      }
    }, 65);
  }, [demoPhase, clearTimers]);

  const isDemo = demoPhase !== "idle";
  const isDemoActive = demoPhase === "typing" || demoPhase === "loading";

  const inputValue = isDemo
    ? demoPhase === "typing"
      ? typedText + (showCursor ? "|" : "")
      : typedText
    : query;

  const filtered = query.trim()
    ? creators.filter((c) =>
        [c.name, c.handle, c.niche]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : creators;

  const visibleCreators =
    demoPhase === "results" ? demoCreators : filtered.length ? filtered : creators;

  const demoChips =
    demoPhase === "results"
      ? ["Tech ×", "Europe ×", "# Influencer ×"]
      : ["Keyword ×", "# Hashtag ×", "@ Username ×"];

  const resultsLabel =
    demoPhase === "loading"
      ? "Scanning..."
      : demoPhase === "results"
        ? "3 found"
        : `${filtered.length} results`;

  return (
    <section
      className="py-28 relative overflow-hidden"
      style={{ background: "var(--bg-page)" }}
    >
      <div
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--glow-purple) 0%, transparent 70%)",
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
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5 text-violet-700 dark:text-violet-300"
              style={{
                background: "rgba(124,58,237,0.10)",
                border: "1px solid rgba(124,58,237,0.35)",
                color: PURPLE_T,
              }}
            >
              <Search size={11} />
              AI Influencer Search
            </motion.div>
            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="font-display font-bold text-4xl md:text-5xl leading-tight mb-5"
              style={{ color: "var(--text-base)" }}
            >
              Stop scrolling.{" "}
              <span
                style={{
                  background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Start finding.
              </span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="text-lg leading-relaxed mb-8"
              style={{ color: "var(--text-muted)" }}
            >
              Find the right creators for your campaign with AI-powered
              search. Filter by niche, engagement rate, location, platform, and
              audience demographics — in seconds.
            </motion.p>

            {/* Platforms */}
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="flex flex-wrap gap-2 mb-8"
            >
              {platforms.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{
                    background: p.bg,
                    color: p.text,
                    border: `1px solid ${p.color}25`,
                  }}
                >
                  {p.name}
                </div>
              ))}
            </motion.div>

            <motion.ul variants={stagger} className="space-y-4 mb-8">
              {[
                "Verified creator profiles across TikTok, YouTube, and Instagram",
                "Filter by niche, hashtag, keyword, location, and audience size",
                "AI-ranked results by brand-fit score and engagement quality",
                "Audience authenticity analysis — prioritize genuine engagement",
              ].map((text, i) => (
                <motion.li
                  key={i}
                  variants={fadeUp}
                  transition={{ duration: 0.5 }}
                  className="flex items-start gap-3"
                >
                  <CheckCircle2
                    size={16}
                    style={{ color: PURPLE_T }}
                    className="shrink-0 mt-0.5"
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>{text}</span>
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
                  ? "rgba(124,58,237,0.25)"
                  : "rgba(124,58,237,0.15)",
                border: isDemoActive
                  ? "1px solid rgba(124,58,237,0.5)"
                  : "1px solid rgba(124,58,237,0.4)",
                color: PURPLE_T,
                opacity: isDemoActive ? 0.75 : 1,
              }}
            >
              {isDemoActive ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {demoPhase === "typing" ? "Typing query..." : "Searching..."}
                </>
              ) : (
                <>
                  Explore search features
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </div>

          {/* Right: interactive mockup */}
          <motion.div variants={fadeUp} transition={{ duration: 0.65 }}>
            <div
              className="rounded-3xl overflow-hidden transition-all duration-500"
              style={{
                background: "var(--bg-card)",
                border: isDemo
                  ? "1px solid rgba(124,58,237,0.45)"
                  : "1px solid var(--border-card-strong)",
                boxShadow: isDemo
                  ? "0 0 48px rgba(124,58,237,0.1)"
                  : "none",
              }}
            >
              {/* Search bar */}
              <div
                className="p-4 relative overflow-hidden"
                style={{ borderBottom: "1px solid var(--bg-card-hover)" }}
              >
                {/* Scanning progress bar */}
                {demoPhase === "loading" && (
                  <motion.div
                    className="absolute top-0 left-0 h-0.5"
                    style={{
                      background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
                    }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.25, ease: "easeInOut" }}
                  />
                )}

                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300"
                  style={{
                    background: "var(--bg-card-hover)",
                    border: isDemo
                      ? "1px solid rgba(124,58,237,0.35)"
                      : "1px solid var(--border-card-strong)",
                  }}
                >
                  <Search
                    size={15}
                    className="shrink-0 transition-colors duration-300"
                    style={{ color: isDemo ? PURPLE : "#475569" }}
                  />
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => !isDemo && setQuery(e.target.value)}
                    readOnly={isDemo}
                    placeholder="Search by niche, hashtag, location..."
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none py-3 -my-3"
                  />
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-medium shrink-0 flex items-center gap-1 transition-all duration-300"
                    style={{
                      background: isDemoActive ? `${PURPLE}40` : `${PURPLE}25`,
                      color: PURPLE_T,
                    }}
                  >
                    {isDemoActive && (
                      <Loader2 size={8} className="animate-spin" />
                    )}
                    AI
                  </span>
                </div>

                {/* Filter chips */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {demoChips.map((chip, i) => (
                    <motion.span
                      key={chip}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, delay: i * 0.06 }}
                      className="px-2.5 py-1 rounded-full text-[10px] font-medium text-white"
                      style={{
                        background:
                          i === 0
                            ? "rgba(124,58,237,0.4)"
                            : i === 1
                              ? "rgba(52,211,153,0.4)"
                              : "rgba(251,146,60,0.4)",
                      }}
                    >
                      {chip}
                    </motion.span>
                  ))}
                  <span className="ml-auto text-[10px] text-slate-600 self-center transition-all duration-300">
                    {resultsLabel}
                  </span>
                </div>
              </div>

              {/* Results */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 transition-all duration-300">
                    <Sparkles size={10} style={{ color: PURPLE_T }} />
                    {demoPhase === "loading"
                      ? "Scanning database..."
                      : "AI-ranked by brand fit"}
                  </div>
                  <div
                    className="text-[10px] font-bold transition-all duration-300"
                    style={{
                      background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {demoPhase === "results" ? "3 matches" : "6.5M creators"}
                  </div>
                </div>

                {/* Creator cards with AnimatePresence */}
                <div className="mb-4">
                  <AnimatePresence mode="wait">
                    {demoPhase === "loading" ? (
                      <motion.div
                        key="skeletons"
                        className="grid grid-cols-3 gap-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                      </motion.div>
                    ) : (
                      <motion.div
                        key={demoPhase === "results" ? "demo-results" : "default"}
                        className="grid grid-cols-3 gap-3"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.3 }}
                      >
                        {visibleCreators.map((c, i) => (
                          <motion.div
                            key={`${demoPhase}-${i}`}
                            initial={{ opacity: 0, scale: 0.93 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              delay: i * 0.09,
                              duration: 0.32,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="rounded-2xl overflow-hidden transition-all hover:scale-[1.03] cursor-pointer"
                            style={{
                              background: "var(--bg-card-hover)",
                              border:
                                demoPhase === "results"
                                  ? "1px solid rgba(124,58,237,0.3)"
                                  : "1px solid var(--border-card)",
                            }}
                          >
                            <div className="relative h-20 w-full overflow-hidden">
                              {c.img ? (
                                <Image
                                  src={c.img}
                                  alt={c.name}
                                  fill
                                  className="object-cover"
                                  style={{ objectPosition: c.objectPosition ?? "top" }}
                                  sizes="160px"
                                />
                              ) : (
                                <div
                                  className={`w-full h-full bg-gradient-to-br ${c.gradient} flex items-center justify-center`}
                                >
                                  <span className="text-white font-bold text-lg tracking-wide opacity-90">
                                    {c.initials}
                                  </span>
                                </div>
                              )}
                              <div
                                data-fixed-dark
                                className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white transition-all duration-300"
                                style={{
                                  background:
                                    demoPhase === "results"
                                      ? "rgba(124,58,237,0.8)"
                                      : "rgba(0,0,0,0.55)",
                                }}
                              >
                                {c.match}% ✓
                              </div>
                            </div>
                            <div className="p-2">
                              <div className="text-[11px] font-bold leading-tight" style={{ color: "var(--text-base)" }}>
                                {c.name}
                              </div>
                              <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                                {c.handle}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span
                                  className="text-[9px]"
                                  style={{ color: PURPLE_T }}
                                >
                                  {c.niche}
                                </span>
                                <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                                  {c.followers}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Platform row */}
                <div
                  className="flex items-center justify-between pt-3"
                  style={{ borderTop: "1px solid var(--bg-card-hover)" }}
                >
                  <div className="text-[10px] text-slate-600">Platforms</div>
                  <div className="flex gap-2">
                    {[
                      { Icon: Instagram, color: "var(--brand-instagram-text)" },
                      { Icon: Youtube, color: "var(--brand-youtube-text)" },
                      { Icon: Twitter, color: "var(--brand-twitter-text)" },
                    ].map(({ Icon, color }, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: `${color}20` }}
                      >
                        <Icon size={12} style={{ color }} />
                      </div>
                    ))}
                    <div className="text-[10px] text-slate-600 self-center">
                      +2 more
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Mobile-only button — appears below the search mockup */}
        <div className="flex lg:hidden mt-6">
          <button
            onClick={triggerDemo}
            disabled={isDemoActive}
            className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{
              background: isDemoActive
                ? "rgba(124,58,237,0.25)"
                : "rgba(124,58,237,0.15)",
              border: isDemoActive
                ? "1px solid rgba(124,58,237,0.5)"
                : "1px solid rgba(124,58,237,0.4)",
              color: PURPLE_T,
              opacity: isDemoActive ? 0.75 : 1,
            }}
          >
            {isDemoActive ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {demoPhase === "typing" ? "Typing query..." : "Searching..."}
              </>
            ) : (
              <>
                Explore search features
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
