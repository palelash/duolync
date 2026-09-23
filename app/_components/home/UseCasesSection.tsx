"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { Building2, Sparkles, Rocket, ArrowRight } from "lucide-react";
import Link from "next/link";

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const useCases = [
  {
    Icon: Building2,
    title: "Influencer Marketing Agency",
    description: "Scale client campaigns without scaling your team. Run dozens of campaigns simultaneously with AI-powered matching, deal tracking, and real-time analytics.",
    color: "#a78bfa",
    bg: "var(--glow-purple)",
    border: "rgba(124,58,237,0.25)",
    gradient: "from-violet-500 to-purple-700",
    perks: ["Multi-client workspace", "White-label reporting", "Bulk creator outreach"],
  },
  {
    Icon: Sparkles,
    title: "Creative Brand Owner",
    description: "Find creators who actually fit your brand DNA — not just big follower counts. Our AI analyzes audience alignment and engagement quality before you commit to a deal.",
    color: "#67e8f9",
    bg: "rgba(6,182,212,0.1)",
    border: "rgba(6,182,212,0.25)",
    gradient: "from-cyan-500 to-blue-600",
    perks: ["AI brand-fit scoring", "Campaign calendar", "ROI tracking"],
  },
  {
    Icon: Rocket,
    title: "Startup Entrepreneur",
    description: "Launch influencer campaigns on a lean budget. Get access to micro-creators with hyper-engaged audiences, and scale up as your business grows.",
    color: "#f472b6",
    bg: "var(--glow-pink)",
    border: "rgba(236,72,153,0.25)",
    gradient: "from-pink-500 to-rose-600",
    perks: ["Free starter plan", "Micro-creator access", "No contracts required"],
  },
];

export function UseCasesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[160px]" style={{ background: "var(--glow-purple)" }} />
      </div>

      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.3)", color: "var(--accent-violet-text)" }}>
            <Sparkles size={11} />
            Use Cases
          </motion.div>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="font-display font-bold text-white text-4xl md:text-5xl mb-4">
            Built for{" "}
            <span style={{ background: "linear-gradient(90deg, #a78bfa, #67e8f9, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              every ambition.
            </span>
          </motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-slate-400 max-w-xl mx-auto">
            Whether you're running a global agency or launching your first campaign — Duolync scales with you.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="grid md:grid-cols-3 gap-5"
        >
          {useCases.map((uc, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              transition={{ duration: 0.6 }}
              className="rounded-3xl overflow-hidden flex flex-col transition-all duration-300 hover:scale-[1.02]"
              style={{ background: uc.bg, border: `1px solid ${uc.border}` }}
            >
              {/* Card header visual */}
              <div className={`h-44 bg-gradient-to-br ${uc.gradient} flex items-center justify-center relative overflow-hidden`}>
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <uc.Icon size={40} className="text-white" />
                </div>
                <div className="absolute top-4 left-4 w-8 h-8 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
                <div className="absolute bottom-6 right-6 w-12 h-12 rounded-xl" style={{ background: "var(--border-card-strong)" }} />
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-display font-bold text-white text-lg mb-2">{uc.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4 flex-1">{uc.description}</p>

                {/* Perks */}
                <ul className="space-y-1.5 mb-5">
                  {uc.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-xs" style={{ color: uc.color }}>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: uc.color }} />
                      {perk}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold transition-all hover:gap-2.5"
                  style={{ color: uc.color }}
                >
                  Discover this use case
                  <ArrowRight size={14} />
                </Link>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
