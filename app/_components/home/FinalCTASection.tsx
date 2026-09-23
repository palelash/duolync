"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { ArrowRight, Building2, Users, Sparkles } from "lucide-react";
import Link from "next/link";

const fadeUp: Variants = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } };

export function FinalCTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page)" }}>
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[160px]" style={{ background: "radial-gradient(circle, var(--glow-purple) 0%, transparent 70%)" }} />
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[140px]" style={{ background: "radial-gradient(circle, var(--glow-pink) 0%, transparent 70%)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle, var(--bg-card-hover) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
      </div>

      <div className="container mx-auto px-4 relative">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.3)", color: "var(--accent-violet-text)" }}>
            <Sparkles size={11} />
            Now Live — Create Your Account
          </motion.div>

          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.7 }}
            className="font-display font-bold text-white tracking-tight mb-6"
            style={{ fontSize: "clamp(2.4rem, 5.5vw, 4rem)", lineHeight: 1.1 }}
          >
            The future of creator{" "}
            <span style={{ background: "linear-gradient(90deg, #a78bfa, #38bdf8, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              marketing
            </span>
            <br />
            starts here.
          </motion.h2>

          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-slate-400 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Start your journey with Duolync today. No credit card required. Cancel anytime. Just genuine brand-creator partnerships.
          </motion.p>

          {/* CTA buttons */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/auth"
              className="group flex items-center gap-2.5 px-8 py-4 rounded-2xl font-bold text-white text-base transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] shadow-2xl"
              style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)", boxShadow: "0 0 40px rgba(124,58,237,0.3)" }}
            >
              <Sparkles size={17} />
              Create Your Account
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </Link>

            <div className="flex gap-3">
              <Link
                href="/for-brands"
                className="flex items-center gap-2 px-5 py-4 rounded-2xl font-medium text-sm transition-all hover:scale-[1.02]"
                style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.3)", color: "var(--accent-violet-text)" }}
              >
                <Building2 size={15} />
                For Brands
              </Link>
              <Link
                href="/for-creators"
                className="flex items-center gap-2 px-5 py-4 rounded-2xl font-medium text-sm transition-all hover:scale-[1.02]"
                style={{ background: "var(--glow-pink)", border: "1px solid rgba(236,72,153,0.3)", color: "var(--accent-pink-text)" }}
              >
                <Users size={15} />
                For Creators
              </Link>
            </div>
          </motion.div>

          {/* Secondary links */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 text-sm transition-all hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                How it works →
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center gap-2 text-sm transition-all hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                Privacy Policy →
              </Link>
            </div>
          </motion.div>

          {/* Trust row */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="flex flex-wrap items-center justify-center gap-6 mt-10 text-xs text-slate-600">
            {["No credit card required", "Free starter plan", "Cancel anytime", "GDPR compliant"].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-slate-700" />
                {t}
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
