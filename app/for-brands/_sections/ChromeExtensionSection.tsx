"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import { Globe, Bookmark, CheckCircle2, Star, Users, Zap, Plus } from "lucide-react";
import Image from "next/image";
import nova1 from "@/assets/nova1.png";
import nova2 from "@/assets/nova2.png";
import nova3 from "@/assets/nova3.png";
import novaBeauty from "@/assets/nova.beauty.png";
import { BrandWaitlistModal } from "./BrandWaitlistModal";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const videoGrid = [
  { img: nova2, label: "Nova Beauty",       views: "13K views"   },
  { img: nova3, label: "Nova Beauty",       views: "1.36M views" },
  { img: nova3, label: "Nova Beauty",       views: "32K views"   },
  { img: nova2, label: "Nova Beauty",       views: "18K views"   },
  { img: nova3, label: "Makeup",            views: "23K views"   },
  { img: nova1, label: "Behind-the-scenes", views: "182K views"  },
];

type SavePhase = "idle" | "saving" | "saved";

export function ChromeExtensionSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savePhase, setSavePhase]     = useState<SavePhase>("idle");
  const saveTimeoutRef                = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearSaveTimeouts = useCallback(() => {
    saveTimeoutRef.current.forEach(clearTimeout);
    saveTimeoutRef.current = [];
  }, []);

  useEffect(() => () => clearSaveTimeouts(), [clearSaveTimeouts]);

  const handleSaveToCRM = useCallback(() => {
    if (savePhase !== "idle") return;
    clearSaveTimeouts();
    setSavePhase("saving");

    const t1 = setTimeout(() => setSavePhase("saved"),  500);
    const t2 = setTimeout(() => setSavePhase("idle"), 3600);
    saveTimeoutRef.current.push(t1, t2);
  }, [savePhase, clearSaveTimeouts]);

  return (
    <>
      <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page)" }}>
        <div
          className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.06) 0%, transparent 70%)" }}
        />

        <div className="container mx-auto px-4">
          <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
            className="grid lg:grid-cols-2 gap-16 items-center"
          >
            {/* ── Left: content ── */}
            <div>
              <motion.div variants={fadeUp} className="flex items-center gap-2 mb-5">
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "var(--accent-amber-text)" }}
                >
                  <Globe size={11} />
                  Browser Extension — The Scout
                </div>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: "rgba(251,191,36,0.15)", color: "var(--accent-amber-text)", border: "1px solid rgba(251,191,36,0.35)" }}
                >
                  Coming Soon
                </span>
              </motion.div>

              <motion.h2 variants={fadeUp} className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-5">
                Discover creators{" "}
                <span style={{ background: "linear-gradient(90deg, #fcd34d, #f87171)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  anywhere on the web.
                </span>
              </motion.h2>

              <motion.p variants={fadeUp} className="text-slate-400 text-lg leading-relaxed mb-8">
                The Scout will let you discover and save creator profiles directly while browsing
                TikTok, Instagram, or YouTube — without switching tabs. Currently in development for Chrome & Edge.
              </motion.p>

              <motion.ul variants={stagger} className="space-y-4 mb-8">
                {[
                  { icon: Bookmark, text: "Save creator profiles with one click — directly from their social pages" },
                  { icon: Star,     text: "View engagement rate, follower count, and niche tags at a glance"        },
                  { icon: Users,    text: "Syncs to your Duolync creator lists and campaign workspace"               },
                  { icon: Zap,      text: "Planned for TikTok, Instagram, and YouTube"                              },
                ].map((item, i) => (
                  <motion.li key={i} variants={fadeUp} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }}
                    >
                      <item.icon size={15} style={{ color: "var(--accent-amber-text)" }} />
                    </div>
                    <span className="text-slate-300 text-sm leading-relaxed">{item.text}</span>
                  </motion.li>
                ))}
              </motion.ul>

              {/* Desktop button — hidden on mobile */}
              <motion.div variants={fadeUp} className="hidden lg:flex items-center gap-3">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02]"
                  style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "var(--accent-amber-text)" }}
                >
                  <Globe size={14} />
                  Get Notified When It Launches
                </button>
                <span className="text-[11px] text-slate-600">Coming to Chrome &amp; Edge</span>
              </motion.div>
            </div>

            {/* ── Right: Browser mockup ── */}
            <motion.div variants={fadeUp} className="relative">

              {/* Browser window */}
              <div
                data-fixed-dark
                className="rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {/* Mac-style title bar */}
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ background: "#080812", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex gap-1.5 shrink-0">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div
                    className="flex-1 mx-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-slate-500"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500/70 shrink-0" />
                    tiktok.com/@nova.beauty
                  </div>
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                  >
                    <Bookmark size={11} className="text-white" />
                  </div>
                </div>

                {/* TikTok-style page content */}
                <div className="p-4 relative">

                  {/* Profile header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 ring-2 ring-pink-500/40">
                      <Image src={novaBeauty} alt="Nova Beauty" width={56} height={56} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-bold text-white">Nova Beauty</span>
                        <CheckCircle2 size={13} className="text-blue-400 shrink-0" />
                        <span className="text-[10px] text-slate-500 ml-0.5">· verified</span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400">
                        <span><strong className="text-white">1.8M</strong> Followers</span>
                        <span><strong className="text-white">12.4M</strong> Likes</span>
                      </div>
                    </div>
                  </div>

                  {/* Video grid — 3×2 */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {videoGrid.map((v, i) => (
                      <div key={i} className="relative rounded-lg overflow-hidden aspect-[9/14]">
                        <Image src={v.img} alt={v.label} fill className="object-cover object-top" sizes="120px" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                        {i >= 3 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-white border-b-[5px] border-b-transparent ml-0.5" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-1.5 left-1.5 right-1.5">
                          <div className="text-[8px] font-semibold text-white leading-tight truncate">{v.label}</div>
                          <div className="flex items-center gap-0.5 text-[7px] text-white/70 mt-0.5">
                            <span>▷</span>
                            <span>{v.views}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Floating Duolync widget ── */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.88, y: 12 }}
                    animate={isInView ? { opacity: 1, scale: 1, y: 0 } : {}}
                    transition={{ delay: 0.55, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute top-4 right-4 rounded-2xl p-3.5 w-52 shadow-2xl"
                    style={{ background: "#0f0f1e", border: "1px solid rgba(124,58,237,0.45)", backdropFilter: "blur(12px)" }}
                  >
                    {/* Widget header */}
                    <div
                      className="flex items-center gap-2 mb-3 pb-2.5"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                      >
                        <Bookmark size={11} className="text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-white">Duolync</span>
                    </div>

                    {/* Stats */}
                    <div className="space-y-1.5 mb-3">
                      {[
                        { label: "Followers",        value: "1.8M"   },
                        { label: "Avg. Eng. Rate",   value: "3.2%"   },
                        { label: "Audience F 25–34", value: "62%"    },
                        { label: "Niche",            value: "Beauty" },
                      ].map((stat, i) => (
                        <div key={i} className="flex justify-between text-[10px]">
                          <span className="text-slate-500">{stat.label}</span>
                          <span className="text-slate-200 font-semibold">{stat.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Last post performance */}
                    <div
                      className="rounded-lg px-2.5 py-2 mb-3"
                      style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)" }}
                    >
                      <div className="text-[9px] font-semibold text-slate-400 mb-1">Last Post Performance:</div>
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="text-violet-400">•</span>
                        <span className="text-slate-300">Reel: <strong className="text-white">3.2× ROI</strong></span>
                        <span className="text-slate-500">(68K higher intent)</span>
                      </div>
                    </div>

                    {/* ── Save to CRM button ── */}
                    <button
                      onClick={handleSaveToCRM}
                      disabled={savePhase !== "idle"}
                      className="w-full flex items-center justify-center gap-1.5 py-2 min-h-11 rounded-xl text-[11px] font-bold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:hover:opacity-100"
                      style={{
                        background: savePhase === "saved"
                          ? "linear-gradient(135deg, #059669, #0d9488)"
                          : "linear-gradient(135deg, #7c3aed, #0891b2)",
                        opacity: savePhase === "saving" ? 0.75 : 1,
                        transition: "background 0.3s ease, opacity 0.2s ease",
                      }}
                    >
                      {savePhase === "saving" ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
                          Saving...
                        </>
                      ) : savePhase === "saved" ? (
                        <>
                          <CheckCircle2 size={11} />
                          Saved ✓
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          Save to List
                        </>
                      )}
                    </button>
                  </motion.div>
                </div>
              </div>

              {/* ── Decorative "Saved to CRM" scroll badge ── */}
              <motion.div
                initial={{ opacity: 0, y: 16, x: -8 }}
                animate={isInView ? { opacity: 1, y: 0, x: 0 } : {}}
                transition={{ delay: 1.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                data-fixed-dark
                className="absolute -bottom-5 left-4 rounded-2xl px-3.5 py-2.5 shadow-xl flex items-center gap-2.5"
                style={{ background: "#0f0f1e", border: "1px solid rgba(52,211,153,0.35)", minWidth: 190 }}
              >
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={10} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-white flex items-center gap-1.5">
                    Saved to Creator List
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                </div>
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                  <Image src={novaBeauty} alt="Nova Beauty" width={28} height={28} className="w-full h-full object-cover" />
                </div>
              </motion.div>

            </motion.div>
          </motion.div>

          {/* Mobile-only button — appears below the browser mockup */}
          <div className="flex lg:hidden mt-6 items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02]"
              style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "var(--accent-amber-text)" }}
            >
              <Globe size={14} />
              Get Notified When It Launches
            </button>
            <span className="text-[11px] text-slate-600">Coming to Chrome &amp; Edge</span>
          </div>
        </div>
      </section>

      {/* ── Brand Waitlist Modal ── */}
      <AnimatePresence>
        {isModalOpen && <BrandWaitlistModal onClose={() => setIsModalOpen(false)} />}
      </AnimatePresence>

      {/* ── "Successfully saved!" fixed toast ── */}
      <AnimatePresence>
        {savePhase === "saved" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            data-fixed-dark
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
            style={{
              background: "#0f0f1e",
              border: "1px solid rgba(52,211,153,0.38)",
              boxShadow: "0 0 32px rgba(52,211,153,0.1)",
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)" }}
            >
              <CheckCircle2 size={15} style={{ color: "var(--accent-emerald-text)" }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Successfully saved!</div>
              <div className="text-[11px] text-slate-500">Nova Beauty added to your creator list</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
