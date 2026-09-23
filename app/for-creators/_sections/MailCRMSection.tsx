"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import {
  Mail,
  CheckCircle2,
  ArrowRight,
  Send,
  Star,
  Clock,
  Paperclip,
  Bell,
  Loader2,
  Instagram,
} from "lucide-react";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const CYAN = "#67e8f9";
const CYAN_T = "var(--accent-cyan-text)";

const emails = [
  { id: "samsung",     brand: "Samsung",    subject: "Partnership Opportunity — Q3 Campaign", preview: "Hi! We'd love to collaborate on our upcoming tech...",          time: "2m ago", unread: true,  tag: "New Deal",  tagColor: "var(--accent-emerald-text)", avatarBg: "#1428a0", avatarColor: "#ffffff", initial: "S" },
  { id: "asos",        brand: "ASOS",        subject: "✓ Contract Signed — Welcome aboard!",    preview: "Your partnership agreement has been confirmed. Here's...",   time: "1h ago", unread: true,  tag: "Active",    tagColor: "var(--accent-cyan-text)", avatarBg: "#2d2d2d", avatarColor: "#ffffff", initial: "A" },
  { id: "levis",       brand: "Levi's",      subject: "Re: Content brief feedback",              preview: "Thanks for the revision! The brief looks great. We'll...",   time: "3h ago", unread: false, tag: "Follow-up", tagColor: "var(--accent-amber-text)", avatarBg: "#c41230", avatarColor: "#ffffff", initial: "L" },
  { id: "steelseries", brand: "SteelSeries", subject: "Payment processed — $2,100",              preview: "Your invoice for the peripheral review has been paid...",    time: "1d ago", unread: false, tag: "Paid",      tagColor: "var(--accent-violet-text)", avatarBg: "#c93600", avatarColor: "#ffffff", initial: "S" },
];

const nikeEmail = {
  brand: "Nike",
  subject: "Partnership Proposal — Campaign 2026",
  preview: "We're interested in featuring you in our upcoming summer...",
  time: "Just now",
  avatarBg: "#111111",
  avatarColor: "#ffffff",
  initial: "N",
  tagColor: "var(--accent-emerald-text)",
};

const dealPipeline = [
  { label: "Negotiating", count: 3,  color: "var(--accent-amber-text)" },
  { label: "Contract",    count: 2,  color: "var(--accent-cyan-text)" },
  { label: "In Progress", count: 4,  color: "var(--accent-emerald-text)" },
  { label: "Completed",   count: 12, color: "var(--accent-violet-text)" },
];

type DemoPhase = "idle" | "running" | "done";

export function MailCRMSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const [demoPhase,          setDemoPhase]         = useState<DemoPhase>("idle");
  const [showNikeCard,       setShowNikeCard]       = useState(false);
  const [nikeTagVisible,     setNikeTagVisible]     = useState(false);
  const [asosContractSigned, setAsosContractSigned] = useState(false);
  const [levisGlowing,       setLevisGlowing]       = useState(false);
  const [bellCount,          setBellCount]          = useState(2);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const resetDemo = useCallback(() => {
    clearAll();
    setDemoPhase("idle");
    setShowNikeCard(false);
    setNikeTagVisible(false);
    setAsosContractSigned(false);
    setLevisGlowing(false);
    setBellCount(2);
  }, [clearAll]);

  const triggerDemo = useCallback(() => {
    if (demoPhase === "running") return;
    if (demoPhase === "done") { resetDemo(); return; }

    clearAll();
    setDemoPhase("running");
    setShowNikeCard(false);
    setNikeTagVisible(false);
    setAsosContractSigned(false);
    setLevisGlowing(false);
    setBellCount(2);

    // Step 1: Nike card slides in + bell ticks up
    const t1 = setTimeout(() => {
      setShowNikeCard(true);
      setBellCount(3);
    }, 500);
    timeoutsRef.current.push(t1);

    // Step 2: Auto-tag badge fades in on Nike card
    const t2 = setTimeout(() => setNikeTagVisible(true), 1200);
    timeoutsRef.current.push(t2);

    // Step 3: ASOS tag flips to "Contract Signed"
    const t3 = setTimeout(() => setAsosContractSigned(true), 1900);
    timeoutsRef.current.push(t3);

    // Step 4: Levi's Follow-up badge glows
    const t4 = setTimeout(() => setLevisGlowing(true), 2600);
    timeoutsRef.current.push(t4);

    // Done
    const t5 = setTimeout(() => setDemoPhase("done"), 3800);
    timeoutsRef.current.push(t5);
  }, [demoPhase, clearAll, resetDemo]);

  const isDemoActive = demoPhase === "running";
  const isDemoLocked = demoPhase !== "idle";
  const isDemo       = demoPhase !== "idle";

  return (
    <section
      className="py-28 relative overflow-hidden"
      style={{ background: "var(--bg-page)" }}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 right-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(103,232,249,0.07) 0%, transparent 70%)",
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
          {/* ── Left: Inbox visual ──────────────────────────────────────── */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.65 }}
            className="order-2 lg:order-1"
          >
            <div
              className="rounded-3xl overflow-hidden transition-all duration-500"
              style={{
                background: "var(--bg-card)",
                border: isDemo
                  ? "1px solid rgba(103,232,249,0.35)"
                  : "1px solid var(--border-card-strong)",
                boxShadow: isDemo ? "0 0 48px rgba(103,232,249,0.07)" : "none",
              }}
            >
              {/* Toolbar */}
              <div
                className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: "1px solid var(--bg-card-hover)" }}
              >
                <div
                  className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl text-xs"
                  style={{
                    background: "var(--bg-card-hover)",
                    border: "1px solid var(--border-card)",
                  }}
                >
                  <Mail size={12} className="text-slate-600" />
                  <span className="text-slate-600">Search conversations...</span>
                </div>
                <div className="relative">
                  <Bell size={18} className="text-slate-600" />
                  {/* Animated bell count */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={bellCount}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      data-fixed-dark
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ background: "#be185d" }}
                    >
                      {bellCount}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Pipeline bar */}
              <div
                className="grid grid-cols-4 gap-px px-5 py-3"
                style={{ borderBottom: "1px solid var(--bg-card-hover)" }}
              >
                {dealPipeline.map((stage) => (
                  <div key={stage.label} className="text-center">
                    <div
                      className="text-sm font-bold font-display"
                      style={{ color: stage.color }}
                    >
                      {stage.count}
                    </div>
                    <div className="text-[9px] text-slate-600">{stage.label}</div>
                  </div>
                ))}
              </div>

              {/* Email list */}
              <div
                className="divide-y"
                style={{ borderColor: "var(--bg-card-hover)" }}
              >
                {/* ── Nike card (animated entry) ──────────────────────── */}
                <AnimatePresence>
                  {showNikeCard && (
                    <motion.div
                      key="nike-card"
                      initial={{ opacity: 0, y: -18, scaleY: 0.85 }}
                      animate={{ opacity: 1, y: 0, scaleY: 1 }}
                      exit={{ opacity: 0, y: -18 }}
                      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      className="flex gap-3 px-5 py-3.5 cursor-pointer transition-all hover:bg-white/[0.02] origin-top"
                      style={{ borderBottom: "1px solid var(--bg-card-hover)" }}
                    >
                      <div
                        className="w-9 h-9 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[12px] font-bold"
                        style={{
                          background: nikeEmail.avatarBg,
                          color: nikeEmail.avatarColor,
                        }}
                      >
                        {nikeEmail.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-semibold text-white">
                            {nikeEmail.brand}
                          </span>
                          {/* Platform badge */}
                          <span
                            className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{
                              background: "rgba(244,114,182,0.15)",
                              color: "var(--accent-pink-text)",
                            }}
                          >
                            <Instagram size={8} />
                            Instagram
                          </span>
                          {/* Auto-tag badge */}
                          <AnimatePresence>
                            {nikeTagVisible && (
                              <motion.span
                                key="nike-tag"
                                initial={{ opacity: 0, scale: 0.7, x: -6 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                transition={{
                                  duration: 0.3,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{
                                  background: `color-mix(in srgb, ${nikeEmail.tagColor} 9%, transparent)`,
                                  color: nikeEmail.tagColor,
                                }}
                              >
                                ✦ New Deal
                              </motion.span>
                            )}
                          </AnimatePresence>
                          <span className="text-[9px] text-slate-700 ml-auto shrink-0">
                            {nikeEmail.time}
                          </span>
                        </div>
                        <div className="text-xs mb-0.5 text-slate-300 font-medium">
                          {nikeEmail.subject}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate">
                          {nikeEmail.preview}
                        </div>
                      </div>
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                        style={{ background: CYAN }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Existing emails ──────────────────────────────────── */}
                {emails.map((email, i) => {
                  const isAsos  = email.id === "asos";
                  const isLevis = email.id === "levis";

                  const tagLabel =
                    isAsos && asosContractSigned ? "✓ Contract Signed" : email.tag;
                  const tagColor =
                    isAsos && asosContractSigned ? "var(--accent-emerald-text)" : email.tagColor;

                  return (
                    <motion.div
                      key={email.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex gap-3 px-5 py-3.5 cursor-pointer transition-all hover:bg-white/[0.02] group"
                    >
                      <div
                        className="w-9 h-9 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[12px] font-bold"
                        style={{
                          background: email.avatarBg,
                          color: email.avatarColor,
                        }}
                      >
                        {email.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className={`text-xs font-semibold ${email.unread ? "text-white" : "text-slate-400"}`}
                          >
                            {email.brand}
                          </span>

                          {/* ASOS — cross-fades between Active and Contract Signed */}
                          {isAsos ? (
                            <AnimatePresence mode="wait">
                              <motion.span
                                key={tagLabel}
                                initial={{ opacity: 0, scale: 0.75 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.75 }}
                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                                style={{
                                  background: `color-mix(in srgb, ${tagColor} 9%, transparent)`,
                                  color: tagColor,
                                }}
                              >
                                {tagLabel}
                              </motion.span>
                            </AnimatePresence>
                          ) : isLevis ? (
                            /* Levi's — glowing pulse on Follow-up badge */
                            <motion.span
                              animate={
                                levisGlowing
                                  ? {
                                      boxShadow: [
                                        "0 0 0px rgba(252,211,77,0)",
                                        "0 0 10px rgba(252,211,77,0.55)",
                                        "0 0 0px rgba(252,211,77,0)",
                                      ],
                                      scale: [1, 1.08, 1],
                                    }
                                  : {}
                              }
                              transition={
                                levisGlowing
                                  ? { duration: 1.1, repeat: 3, ease: "easeInOut" }
                                  : {}
                              }
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                              style={{
                                background: `color-mix(in srgb, ${email.tagColor} 9%, transparent)`,
                                color: email.tagColor,
                              }}
                            >
                              {email.tag}
                            </motion.span>
                          ) : (
                            /* All other emails — static badge */
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                              style={{
                                background: `color-mix(in srgb, ${email.tagColor} 9%, transparent)`,
                                color: email.tagColor,
                              }}
                            >
                              {email.tag}
                            </span>
                          )}

                          <span className="text-[9px] text-slate-700 ml-auto shrink-0">
                            {email.time}
                          </span>
                        </div>
                        <div
                          className={`text-xs mb-0.5 ${email.unread ? "text-slate-300 font-medium" : "text-slate-500"}`}
                        >
                          {email.subject}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate">
                          {email.preview}
                        </div>
                      </div>
                      {email.unread && (
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                          style={{ background: CYAN }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Compose bar */}
              <div
                className="px-5 py-3"
                style={{
                  borderTop: "1px solid var(--bg-card-hover)",
                  background: "rgba(255,255,255,0.01)",
                }}
              >
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: "var(--bg-card-hover)",
                    border: "1px solid var(--border-card)",
                  }}
                >
                  <input
                    placeholder="Reply to Nike..."
                    className="flex-1 bg-transparent text-xs text-slate-400 placeholder:text-slate-600 focus:outline-none"
                    readOnly
                    tabIndex={-1}
                  />
                  <Paperclip size={12} className="text-slate-600" />
                  <button
                    tabIndex={-1}
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #db2777, #9333ea)",
                    }}
                  >
                    <Send size={10} className="text-white" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Right: content ────────────────────────────────────────── */}
          <div className="order-1 lg:order-2">
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5"
              style={{
                background: "rgba(103,232,249,0.12)",
                border: "1px solid rgba(103,232,249,0.35)",
                color: CYAN_T,
              }}
            >
              <Mail size={11} />
              Deal Inbox &amp; Tracking
            </motion.div>

            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="font-display font-bold text-white text-4xl md:text-5xl leading-tight mb-5"
            >
              All your deals.{" "}
              <span
                style={{
                  background: `linear-gradient(90deg, ${CYAN}, #c084fc)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                One inbox.
              </span>
            </motion.h2>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.65 }}
              className="text-slate-400 text-lg leading-relaxed mb-8"
            >
              No more lost emails. No more missed follow-ups. Every brand
              conversation and collaboration — organized and searchable in
              one place.
            </motion.p>

            <motion.ul variants={stagger} className="space-y-4 mb-8">
              {[
                { icon: Mail,         text: "Unified inbox for all brand communications from Duolync" },
                { icon: Star,         text: "Auto-tags deals by stage: Negotiating, Active, and Completed" },
                { icon: Bell,         text: "Reminders when brands go quiet — so you never lose a deal" },
                { icon: CheckCircle2, text: "Full partnership history and collaboration timeline in one place" },
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
                      background: "rgba(103,232,249,0.12)",
                      border: "1px solid rgba(103,232,249,0.25)",
                    }}
                  >
                    <item.icon size={15} style={{ color: CYAN_T }} />
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
              className="hidden lg:flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
              style={{
                background: isDemoLocked
                  ? "rgba(103,232,249,0.25)"
                  : "rgba(103,232,249,0.15)",
                border: isDemoLocked
                  ? "1px solid rgba(103,232,249,0.5)"
                  : "1px solid rgba(103,232,249,0.35)",
                color: CYAN_T,
                opacity: isDemoActive ? 0.75 : 1,
              }}
            >
              {isDemoActive ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Loading inbox...
                </>
              ) : (
                <>
                  See it in action
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Mobile-only button — appears below the inbox panel */}
        <div className="flex lg:hidden mt-6">
          <button
            onClick={triggerDemo}
            disabled={isDemoActive}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 min-h-11 rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{
              background: isDemoLocked
                ? "rgba(103,232,249,0.25)"
                : "rgba(103,232,249,0.15)",
              border: isDemoLocked
                ? "1px solid rgba(103,232,249,0.5)"
                : "1px solid rgba(103,232,249,0.35)",
              color: CYAN_T,
              opacity: isDemoActive ? 0.75 : 1,
            }}
          >
            {isDemoActive ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Loading inbox...
              </>
            ) : (
              <>
                See it in action
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
