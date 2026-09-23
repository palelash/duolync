"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView, type Variants } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Star, Gift, Rocket, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

const TikTokIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-label="TikTok">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-label="YouTube">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const InstagramIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-label="Instagram">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);

const fadeUp: Variants = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const PINK = "#f472b6";
const VIOLET = "#c084fc";
const AMBER = "#fcd34d";
const EMERALD = "#34d399";
const PINK_T = "var(--accent-pink-text)";

const perks = [
  { icon: Zap, text: "Free plan — no credit card required" },
  { icon: Star, text: "Access to curated brand deals matching your niche" },
  { icon: Gift, text: "Public creator portfolio to share with brands" },
  { icon: Rocket, text: "AI-powered insights to optimize your content" },
];

const avatarGradients = [
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-blue-600",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-600",
];

const socialProof: { icon: ReactNode; label: string }[] = [
  { icon: <TikTokIcon />, label: "TikTok" },
  { icon: <YouTubeIcon />, label: "YouTube" },
  { icon: <InstagramIcon />, label: "Instagram" },
];

export function FinalCTASection() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
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
    <section className="py-32 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      {/* Dramatic ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full blur-[180px]"
          style={{ background: "radial-gradient(ellipse, rgba(236,72,153,0.15) 0%, rgba(147,51,234,0.08) 50%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle, var(--bg-card-hover) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
      </div>

      {/* Top accent line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24" style={{ background: "linear-gradient(to bottom, rgba(236,72,153,0.5), transparent)" }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(236,72,153,0.5), transparent)" }} />

      <div className="relative container mx-auto px-4 text-center">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="max-w-3xl mx-auto"
        >
          {/* Badge */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8 backdrop-blur-sm" style={{ background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.4)", color: "var(--accent-pink-text)" }}>
            <Sparkles size={13} />
            For Creators · Sign Up Free
          </motion.div>

          {/* Headline */}
          <motion.h2 variants={fadeUp} transition={{ duration: 0.6 }} className="font-display font-bold text-white leading-[1.08] tracking-tight mb-6" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)" }}>
            Claim your spot in the{" "}
            <span style={{ background: `linear-gradient(90deg, ${PINK}, ${VIOLET}, #67e8f9)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              future of creator marketing.
            </span>
          </motion.h2>

          <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="text-slate-400 text-xl leading-relaxed mb-8 max-w-xl mx-auto">
            Start your journey with Duolync today. Get matched with top brands, manage your deals, and grow your creator career — all in one place.
          </motion.p>

          {/* Social proof row */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="flex items-center justify-center gap-6 mb-10">
            {socialProof.map((s, i) => (
              <div key={i} className="text-center flex flex-col items-center gap-1.5">
                <div className="text-slate-400">{s.icon}</div>
                <div className="text-[10px] text-slate-600">{s.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Perks grid */}
          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10">
            {perks.map((perk, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
                style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}
              >
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(236,72,153,0.15)", border: "1px solid rgba(236,72,153,0.25)" }}>
                  <perk.icon size={13} style={{ color: PINK_T }} />
                </div>
                <span className="text-sm text-slate-300">{perk.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA form */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }}>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-3">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
                required
                className="flex-1 px-5 py-3.5 rounded-2xl text-white placeholder:text-slate-600 focus:outline-none text-sm transition-all"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(236,72,153,0.6)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-card-strong)"; }}
              />
              <button
                type="submit"
                disabled={isLoading || !email}
                className="px-7 py-3.5 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 text-sm transition-all duration-300 hover:opacity-90 hover:scale-[1.02] whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                style={{ background: "linear-gradient(135deg, #db2777, #9333ea)" }}
              >
                {isLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={16} />}
                {isLoading ? "Redirecting..." : "Sign Up Free"}
              </button>
            </form>

            {/* Creator avatars */}
            <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
              <div className="flex -space-x-2">
                {avatarGradients.map((g, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${g} border-2`} style={{ borderColor: "var(--bg-page-alt)" }} />
                ))}
              </div>
              <span>
                Creators already building their portfolios on Duolync
              </span>
            </div>
          </motion.div>

          {/* Bottom separator */}
          <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className="mt-20 flex items-center gap-4">
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, var(--border-card))" }} />
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <Sparkles size={12} className="text-pink-900" />
              Duolync — Built for Creators
            </div>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, var(--border-card))" }} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
