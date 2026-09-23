"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Building2,
  Users,
  Star,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const trust = [
  { icon: Users, value: "Verified", label: "Creator Profiles" },
  { icon: ShieldCheck, value: "Secure", label: "Deal Management" },
  { icon: TrendingUp, value: "Real-Time", label: "Analytics" },
  { icon: Building2, value: "Multi-Platform", label: "YT · TT · IG" },
];

const avatarGradients = [
  "from-violet-500 to-purple-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-600",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-600",
];

export function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: "var(--bg-page)" }}
    >
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-32 left-1/4 w-[700px] h-[700px] rounded-full blur-[160px]"
          style={{
            background:
              "radial-gradient(circle, var(--glow-purple) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-1/2 right-0 w-[500px] h-[500px] rounded-full blur-[140px]"
          style={{
            background:
              "radial-gradient(circle, var(--glow-cyan) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, var(--glow-pink) 0%, transparent 70%)",
          }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--dot-grid) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
      </div>

      <div className="relative container mx-auto px-4 pt-28 pb-16">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8 backdrop-blur-sm text-violet-700 dark:text-violet-300"
            style={{
              background: "var(--glow-purple)",
              border: "1px solid rgba(124,58,237,0.4)",
              color: "var(--accent-violet-text)",
            }}
          >
            <Sparkles size={13} />
            AI-Powered Influencer Marketing Platform
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.15,
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-display font-bold tracking-tight leading-[1.06] mb-6"
            style={{ fontSize: "clamp(2.8rem, 6.5vw, 5rem)", color: "var(--text-base)" }}
          >
            Where{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #a78bfa, #38bdf8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Brands
            </span>{" "}
            Meet{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #f472b6, #c084fc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Creators
            </span>
            <br />
            that Actually Convert.
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="text-xl max-w-2xl mx-auto mb-12 leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Duolync connects brands with verified creators, streamlines
            campaign management, and helps creators land the deals they deserve.
          </motion.p>

          {/* Dual CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14"
          >
            <Link
              href="/auth?role=brand"
              className="group flex items-center gap-2.5 px-7 py-4 rounded-2xl font-semibold text-white text-base transition-all duration-300 hover:scale-[1.03] hover:opacity-95 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #0891b2)",
              }}
            >
              <Building2 size={18} />
              I&apos;m a Brand
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/auth?role=creator"
              className="group flex items-center gap-2.5 px-7 py-4 rounded-2xl font-semibold text-white text-base transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #db2777, #9333ea)",
              }}
            >
              <Users size={18} />
              I&apos;m a Creator
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/auth"
              className="flex items-center gap-2 px-6 py-4 rounded-2xl font-medium text-sm transition-all duration-300 hover:scale-[1.02]"
              style={{
                background: "var(--bg-card-hover)",
                border: "1px solid var(--border-card-strong)",
                color: "var(--text-muted)",
              }}
            >
              Get Started
            </Link>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 text-sm"
          >
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {avatarGradients.map((g, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} border-2`}
                    style={{ borderColor: "var(--bg-page)" }}
                  />
                ))}
              </div>
              <span style={{ color: "var(--text-muted)" }}>
                Brands & creators connecting on Duolync
              </span>
            </div>
          </motion.div>

          {/* Trust stats */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.7 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto"
          >
            {trust.map((t) => (
              <div
                key={t.label}
                className="text-center p-4 rounded-2xl transition-all hover:scale-[1.04]"
                style={{
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--bg-card-hover)",
                }}
              >
                <div
                  className="text-2xl font-bold font-display mb-0.5"
                  style={{
                    background: "linear-gradient(90deg, #a78bfa, #38bdf8)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {t.value}
                </div>
                <div className="text-xs" style={{ color: "var(--text-faint)" }}>{t.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Floating platform cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.8 }}
          className="flex justify-center gap-4 mt-16 flex-wrap"
        >
          {[
            {
              label: "For Brands",
              desc: "AI matching · Campaign tools · Analytics",
              color: "var(--accent-violet-text)",
              bg: "var(--glow-purple)",
              border: "rgba(124,58,237,0.25)",
              shadow: "rgba(124,58,237,0.15)",
              href: "/for-brands",
            },
            {
              label: "For Creators",
              desc: "Curated deals · Growth AI · Dashboard",
              color: "var(--accent-pink-text)",
              bg: "var(--glow-pink)",
              border: "rgba(236,72,153,0.25)",
              shadow: "rgba(236,72,153,0.15)",
              href: "/for-creators",
            },
          ].map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] bg-white dark:bg-zinc-900/70 backdrop-blur-sm"
              style={{
                border: `1px solid ${card.border}`,
                boxShadow: `0 4px 24px ${card.shadow}`,
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${card.color}22` }}
              >
                <Sparkles size={15} style={{ color: card.color }} />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                  {card.label}
                </div>
                <div className="text-xs text-slate-500">{card.desc}</div>
              </div>
              <ArrowRight size={14} style={{ color: card.color }} />
            </Link>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
