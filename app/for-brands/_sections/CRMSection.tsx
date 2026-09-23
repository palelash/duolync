"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import {
  Database, Mail, Search, Filter, CheckCircle2,
  Send, Users, BarChart3, Bell, Clock, Star, ChevronRight,
} from "lucide-react";
import Image from "next/image";
import novaBeautyImg from "@/assets/nova.beauty.png";
import styleWorldImg from "@/assets/style.world.jpg";
import fitlifeImg from "@/assets/fitlife.jpg";
import techguruImg from "@/assets/techguru.jpg";
import marcusImg from "@/assets/marucs.jpg";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

type DemoPhase = "idle" | "sending" | "done";
type ChipPhase = "chip" | "flashing" | "real";
type RowPhase  = "sending" | "sent";

const creators = [
  { name: "@nova.beauty", platform: "TikTok",    followers: "1.8M", status: "Active",      statusColor: "var(--accent-emerald-text)", deals: 3, img: novaBeautyImg },
  { name: "@style.world", platform: "Instagram", followers: "2.1M", status: "Negotiating", statusColor: "var(--accent-amber-text)", deals: 1, img: styleWorldImg },
  { name: "@fitlife.co",  platform: "YouTube",   followers: "980K", status: "Pending",     statusColor: "var(--accent-sky-text)", deals: 0, img: fitlifeImg    },
  { name: "@techguru",    platform: "TikTok",    followers: "560K", status: "Completed",   statusColor: "var(--accent-violet-text)", deals: 5, img: techguruImg   },
  { name: "@travel.joe",  platform: "Instagram", followers: "1.3M", status: "Active",      statusColor: "var(--accent-emerald-text)", deals: 2, img: marcusImg     },
];

const emailTemplate = {
  subject: "Collab opportunity with [BrandName] 🚀",
  body: "Hi {{creator_name}},\n\nWe love your content on {{platform}}! We'd love to collaborate on our upcoming {{campaign_name}} campaign.\n\nYour audience engagement rate of {{eng_rate}} makes you a perfect fit for our brand.\n\nLet's connect →",
};

// Variable chips shown in the composer and their resolved real values
const chips = [
  { tag: "{{creator_name}}", real: "Nova Beauty" },
  { tag: "{{platform}}",     real: "TikTok"      },
  { tag: "{{eng_rate}}",     real: "5.2%"        },
];

// Only these row indices transition (Negotiating → Sending → Sent, Pending → Sending → Sent)
const ANIMATED_ROW_DELAYS: Record<number, { sending: number; sent: number }> = {
  1: { sending: 120,  sent: 720  },
  2: { sending: 280,  sent: 1120 },
};

export function CRMSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  const [chipPhase, setChipPhase] = useState<ChipPhase>("chip");
  const [rowPhases, setRowPhases] = useState<Record<number, RowPhase>>({});

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const triggerDemo = useCallback(() => {
    if (demoPhase === "sending") return;
    clearAll();

    // Reset any prior run
    setRowPhases({});
    setChipPhase("chip");
    setDemoPhase("sending");

    const push = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timeoutsRef.current.push(t);
    };

    // ── Chip flash then swap ──────────────────────────────────
    push(() => setChipPhase("flashing"), 60);
    push(() => setChipPhase("real"),     360);

    // ── Row status transitions ────────────────────────────────
    Object.entries(ANIMATED_ROW_DELAYS).forEach(([idxStr, delays]) => {
      const idx = Number(idxStr);
      push(() => setRowPhases((p) => ({ ...p, [idx]: "sending" })), delays.sending);
      push(() => setRowPhases((p) => ({ ...p, [idx]: "sent"    })), delays.sent);
    });

    // ── Finish + auto-reset ───────────────────────────────────
    push(() => setDemoPhase("done"), 1450);
    push(() => {
      setDemoPhase("idle");
      setChipPhase("chip");
      setRowPhases({});
    }, 5500);
  }, [demoPhase, clearAll]);

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      <div
        className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)" }}
      />

      <div className="container mx-auto px-4">
        {/* Section header */}
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <div className="flex items-center justify-center gap-2 mb-5">
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)", color: "var(--accent-sky-text)" }}
            >
              <Database size={11} />
              Creator Database &amp; Outreach
            </motion.div>
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: "rgba(56,189,248,0.15)", color: "var(--accent-sky-text)", border: "1px solid rgba(56,189,248,0.35)" }}
            >
              Beta
            </motion.span>
          </div>
          <motion.h2 variants={fadeUp} className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-4">
            One workspace.{" "}
            <span style={{ background: "linear-gradient(90deg, #7dd3fc, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Every partnership.
            </span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-slate-400 max-w-xl mx-auto text-lg">
            Centralize every creator relationship, send collaboration invites, and track every deal from first contact to completion.
          </motion.p>
        </motion.div>

        {/* Dashboard grid */}
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid lg:grid-cols-3 gap-4"
        >
          {/* ── CRM Table (2 cols) ── */}
          <motion.div
            variants={fadeUp}
            className="lg:col-span-2 rounded-3xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-card-strong)" }}
          >
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--bg-card-hover)" }}>
              <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--bg-card-hover)" }}>
                <Search size={12} className="text-slate-600" />
                <span className="text-slate-600">Search creators...</span>
              </div>
              <button tabIndex={-1} className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-xl" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--bg-card-hover)", color: "var(--text-muted)" }}>
                <Filter size={11} />
                Filters
              </button>
              <button tabIndex={-1} className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-xl font-semibold" style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)", color: "var(--accent-sky-text)" }}>
                <Mail size={11} />
                Bulk Email
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-5 gap-2 px-5 py-2 text-[10px] font-medium text-slate-600" style={{ borderBottom: "1px solid var(--bg-card-hover)" }}>
              <span className="col-span-2">Creator</span>
              <span>Platform</span>
              <span>Status</span>
              <span>Deals</span>
            </div>

            {/* Rows */}
            <div className="divide-y" style={{ borderColor: "var(--bg-card-hover)" }}>
              {creators.map((c, i) => {
                const rowPhase = rowPhases[i];

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="grid grid-cols-5 gap-2 items-center px-5 py-3 transition-all hover:bg-white/[0.02] cursor-pointer group"
                  >
                    {/* Creator info */}
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                        <Image src={c.img} alt={c.name} width={32} height={32} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="text-sm text-slate-200 font-medium group-hover:text-white transition-colors">{c.name}</div>
                        <div className="text-[10px] text-slate-600">{c.followers}</div>
                      </div>
                    </div>

                    <span className="text-xs text-slate-500">{c.platform}</span>

                    {/* Status badge — animated for rows 1 & 2 */}
                    <div>
                      <AnimatePresence mode="wait">
                        {rowPhase === "sent" ? (
                          <motion.span
                            key="sent"
                            initial={{ opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.7 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(52,211,153,0.15)", color: "var(--accent-emerald-text)" }}
                          >
                            <CheckCircle2 size={9} />
                            Sent ✓
                          </motion.span>
                        ) : rowPhase === "sending" ? (
                          <motion.span
                            key="sending"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.18 }}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(124,58,237,0.18)", color: "var(--accent-violet-text)" }}
                          >
                            <span className="w-2 h-2 rounded-full border border-violet-400 border-t-transparent animate-spin shrink-0" />
                            Sending...
                          </motion.span>
                        ) : (
                          <motion.span
                            key="original"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: `color-mix(in srgb, ${c.statusColor} 9%, transparent)`, color: c.statusColor }}
                          >
                            {c.status}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{c.deals} deals</span>
                      <ChevronRight size={12} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--bg-card-hover)", background: "rgba(255,255,255,0.01)" }}>
              <span className="text-[11px] text-slate-600">Creator database · 24 active campaigns</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  8 Active
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  5 Negotiating
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Right column ── */}
          <div className="space-y-4">
            {/* Bulk email composer */}
            <motion.div
              variants={fadeUp}
              className="rounded-3xl p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-card-strong)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.25)" }}>
                  <Send size={13} style={{ color: "var(--accent-sky-text)" }} />
                </div>
                <span className="text-sm font-semibold text-white">Bulk Outreach</span>
              </div>

              {/* Recipients */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-[10px] text-slate-600">To:</span>
                {["128 creators", "Beauty niche"].map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(56,189,248,0.12)", color: "var(--accent-sky-text)", border: "1px solid rgba(56,189,248,0.2)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Subject line */}
              <div
                className="text-[11px] text-slate-400 mb-2 px-2 py-1.5 rounded-lg"
                style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--bg-card-hover)" }}
              >
                <span className="text-slate-600 text-[9px]">Subject: </span>
                {emailTemplate.subject}
              </div>

              {/* Body preview */}
              <div
                className="text-[10px] text-slate-500 whitespace-pre-line leading-relaxed mb-3 px-2 py-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--bg-card-hover)" }}
              >
                {emailTemplate.body.split("\n").slice(0, 4).join("\n")}
                <span className="text-slate-700">...</span>
              </div>

              {/* ── Personalisation chips ── */}
              <div className="flex flex-wrap gap-1 mb-3 items-center">
                {chips.map((chip) => (
                  <AnimatePresence mode="wait" key={chip.tag}>
                    {chipPhase !== "real" ? (
                      <motion.span
                        key="chip"
                        animate={
                          chipPhase === "flashing"
                            ? {
                                scale: [1, 1.22, 1.06],
                                boxShadow: [
                                  "0 0 0px rgba(167,139,250,0)",
                                  "0 0 12px rgba(167,139,250,0.75)",
                                  "0 0 5px rgba(167,139,250,0.35)",
                                ],
                              }
                            : { scale: 1, boxShadow: "0 0 0px rgba(167,139,250,0)" }
                        }
                        transition={{ duration: 0.26, ease: "easeOut" }}
                        exit={{ opacity: 0, scale: 0.65, transition: { duration: 0.14 } }}
                        className="text-[9px] px-1.5 py-0.5 rounded font-mono inline-block"
                        style={{
                          background: chipPhase === "flashing" ? "rgba(124,58,237,0.55)" : "rgba(124,58,237,0.15)",
                          color: "var(--accent-violet-text)",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {chip.tag}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="real"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 450, damping: 20 }}
                        className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold inline-block"
                        style={{
                          background: "rgba(52,211,153,0.15)",
                          color: "var(--accent-emerald-text)",
                          border: "1px solid rgba(52,211,153,0.3)",
                        }}
                      >
                        {chip.real}
                      </motion.span>
                    )}
                  </AnimatePresence>
                ))}
                <span className="text-[9px] text-slate-600">auto-filled</span>
              </div>

              {/* ── Send button ── */}
              <AnimatePresence mode="wait">
                {demoPhase === "done" ? (
                  <motion.button
                    key="done"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 min-h-11 rounded-xl text-xs font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #059669, #0d9488)" }}
                  >
                    <CheckCircle2 size={12} />
                    128 emails sent!
                  </motion.button>
                ) : demoPhase === "sending" ? (
                  <motion.button
                    key="sending"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    disabled
                    className="w-full flex items-center justify-center gap-1.5 py-2 min-h-11 rounded-xl text-xs font-semibold text-white cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #0891b2, #7c3aed)", opacity: 0.82 }}
                  >
                    <span className="w-3 h-3 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
                    Sending...
                  </motion.button>
                ) : (
                  <motion.button
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    onClick={triggerDemo}
                    className="w-full flex items-center justify-center gap-1.5 py-2 min-h-11 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #0891b2, #7c3aed)" }}
                  >
                    <Send size={12} />
                    Send to 128 creators
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Stats cards */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
              {[
                { icon: Users,    value: "128",  label: "In database",   color: "var(--accent-violet-text)" },
                { icon: Mail,     value: "94%",  label: "Open rate",     color: "var(--accent-emerald-text)" },
                { icon: BarChart3, value: "3.8×", label: "Avg. ROI",      color: "var(--accent-sky-text)" },
                { icon: Clock,    value: "2.1d", label: "Avg. response", color: "var(--accent-amber-text)" },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-4 transition-all hover:scale-[1.03]"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)" }}
                >
                  <stat.icon size={14} style={{ color: stat.color }} className="mb-2" />
                  <div className="font-bold text-white text-lg font-display">{stat.value}</div>
                  <div className="text-[10px] text-slate-600">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8"
        >
          {[
            { icon: Database, title: "Creator database",      desc: "Build and organise a searchable list of creators you've discovered or worked with." },
            { icon: Mail,     title: "Outreach tools",       desc: "Send collaboration invites with AI-assisted templates and track responses."          },
            { icon: Star,     title: "Partnership history",  desc: "Track every collaboration and campaign result in one place."                          },
            { icon: Bell,     title: "Deal pipeline",        desc: "Manage deal progress from first contact to confirmed deliverable."                    },
          ].map((f, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="p-5 rounded-2xl transition-all hover:scale-[1.02]"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)" }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.2)" }}
              >
                <f.icon size={16} style={{ color: "var(--accent-sky-text)" }} />
              </div>
              <div className="text-sm font-semibold text-white mb-1">{f.title}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{f.desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
