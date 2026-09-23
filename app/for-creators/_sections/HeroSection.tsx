"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Zap, TrendingUp, DollarSign, Shield, Star, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

const TikTokIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-label="TikTok">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-label="YouTube">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const InstagramIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-label="Instagram">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);

const PlatformIcons = () => (
  <div className="flex items-center justify-center gap-2 text-slate-400">
    <TikTokIcon />
    <YouTubeIcon />
    <InstagramIcon />
  </div>
);

const avatarGradients = [
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-blue-600",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-600",
];

const stats: { value: ReactNode; label: string; icon: React.ElementType }[] = [
  { value: "Curated", label: "Brand deals for you", icon: DollarSign },
  { value: "Verified", label: "Brand profiles only", icon: Shield },
  { value: "AI", label: "Smart matching", icon: Zap },
  { value: <PlatformIcons />, label: "Platforms supported", icon: Star },
];

export function HeroSection() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    const params = new URLSearchParams({ email, role: "creator" });
    router.push(`/auth?${params.toString()}`);
  }

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 right-1/4 w-[700px] h-[700px] rounded-full blur-[160px]"
          style={{ background: "radial-gradient(circle, var(--glow-pink) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[140px]"
          style={{ background: "radial-gradient(circle, var(--glow-cyan) 0%, transparent 70%)" }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, var(--bg-card-hover) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
      </div>

      <div className="relative container mx-auto px-4 pt-28 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-medium mb-8 backdrop-blur-sm"
            style={{ borderColor: "rgba(236,72,153,0.4)", background: "var(--glow-pink)", color: "var(--accent-pink-text)" }}
          >
            <Zap size={13} />
            Built for Creators, by Creators
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-bold text-white leading-[1.08] tracking-tight mb-6"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            Stop the Noise.{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #f472b6, #c084fc, #67e8f9)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Start the Growth.
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.7 }}
            className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Tired of fake offers and exhausting DMs? Get curated, high-quality brand deals tailored to your niche — and manage your entire creator career from one place.
          </motion.p>

          {/* Email CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="max-w-md mx-auto mb-8"
          >
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); }}
                  required
                  className="flex-1 px-4 py-3 rounded-xl text-white placeholder:text-slate-600 focus:outline-none transition-all"
                  style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(236,72,153,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-card-strong)"; }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="px-6 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 shrink-0 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                  style={{ background: "linear-gradient(135deg, #db2777, #9333ea)" }}
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {isLoading ? "Redirecting..." : "Get Started"}
                </button>
              </form>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex items-center justify-center gap-3 text-sm text-slate-500"
          >
            <div className="flex -space-x-2">
              {avatarGradients.map((g, i) => (
                <div key={i} className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} border-2`} style={{ borderColor: "var(--bg-page-alt)" }} />
              ))}
            </div>
            <span>
              Creators already building their portfolio on Duolync
            </span>
          </motion.div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto mt-20"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-5 rounded-2xl backdrop-blur-sm transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--bg-card-hover)" }}
            >
              <div
                className="text-2xl font-bold font-display mb-1 flex items-center justify-center"
                style={typeof stat.value === "string" ? {
                  background: "linear-gradient(90deg, #f9a8d4, #c4b5fd)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                } : undefined}
              >
                {stat.value}
              </div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Problem → Solution visual strip */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.7 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-14 max-w-2xl mx-auto"
        >
          {/* Before */}
          <div className="flex-1 rounded-2xl px-5 py-4 text-center" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--accent-red-text)" }}>Before</div>
            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex items-center gap-2 justify-center"><span style={{ color: "var(--accent-red-text)" }}>✕</span> Spam DMs from random brands</div>
              <div className="flex items-center gap-2 justify-center"><span style={{ color: "var(--accent-red-text)" }}>✕</span> Lost emails &amp; missed deals</div>
              <div className="flex items-center gap-2 justify-center"><span style={{ color: "var(--accent-red-text)" }}>✕</span> Manual follow-ups everywhere</div>
            </div>
          </div>

          {/* Arrow */}
          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #db2777, #9333ea)" }}>
            <ArrowRight size={14} className="text-white" />
          </div>

          {/* After */}
          <div className="flex-1 rounded-2xl px-5 py-4 text-center" style={{ background: "var(--glow-emerald)", border: "1px solid rgba(52,211,153,0.15)" }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--accent-emerald-text)" }}>After</div>
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex items-center gap-2 justify-center"><span className="text-emerald-400">✓</span> Curated deals matching your niche</div>
              <div className="flex items-center gap-2 justify-center"><span className="text-emerald-400">✓</span> One inbox for everything</div>
              <div className="flex items-center gap-2 justify-center"><span className="text-emerald-400">✓</span> AI handles the follow-ups</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
