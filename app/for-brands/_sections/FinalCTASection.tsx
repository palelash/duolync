"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView, type Variants } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Lock, Bell, Loader2 } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const perks = [
  { icon: Zap, text: "Free plan to get started — no credit card required" },
  { icon: Lock, text: "Campaign and creator management tools included" },
  { icon: Bell, text: "Early access to new features as they roll out" },
  { icon: Sparkles, text: "Priority support during onboarding" },
];

const avatarGradients = [
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-blue-600",
  "from-pink-500 to-rose-600",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-600",
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
    const params = new URLSearchParams({ email, role: "brand" });
    router.push(`/auth?${params.toString()}`);
  }

  return (
    <section className="py-32 relative overflow-hidden" style={{ background: "var(--bg-page)" }}>
      {/* Dramatic glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full blur-[160px]"
          style={{ background: "radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, var(--glow-cyan) 50%, transparent 70%)" }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, var(--bg-card-hover) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Top border glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b" style={{ background: "linear-gradient(to bottom, rgba(124,58,237,0.5), transparent)" }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(124,58,237,0.5), transparent)" }} />

      <div className="relative container mx-auto px-4 text-center">
        <motion.div
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="max-w-3xl mx-auto"
        >
          {/* Badge */}
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8 backdrop-blur-sm" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.4)", color: "var(--accent-violet-text)" }}>
            <Sparkles size={13} />
            For Brands · Sign Up Free
          </motion.div>

          {/* Headline */}
          <motion.h2 variants={fadeUp} className="font-display font-bold text-white leading-[1.08] tracking-tight mb-6" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)" }}>
            Start finding{" "}
            <span style={{ background: "linear-gradient(90deg, #a78bfa, #38bdf8, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              the right creators.
            </span>
          </motion.h2>

          <motion.p variants={fadeUp} className="text-slate-400 text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            Create your Duolync account today and start discovering, managing, and measuring creator partnerships in one place.
          </motion.p>

          {/* Perks grid */}
          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10">
            {perks.map((perk, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
                style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-card)" }}
              >
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}>
                  <perk.icon size={13} style={{ color: "var(--accent-violet-text)" }} />
                </div>
                <span className="text-sm text-slate-300">{perk.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA form */}
          <motion.div variants={fadeUp}>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-3">
              <input
                type="email"
                placeholder="your@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
                required
                className="flex-1 px-5 py-3.5 rounded-2xl text-white placeholder:text-slate-600 focus:outline-none transition-all text-sm"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-card-strong)" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-card-strong)"; }}
              />
              <button
                type="submit"
                disabled={isLoading || !email}
                className="px-7 py-3.5 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 text-sm transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
              >
                {isLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={16} />}
                {isLoading ? "Redirecting..." : "Get Started"}
              </button>
            </form>

            {/* Social proof */}
            <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
              <div className="flex -space-x-2">
                {avatarGradients.map((g, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${g} border-2`} style={{ borderColor: "var(--bg-page)" }} />
                ))}
              </div>
              <span>
                Brands already discovering creators on Duolync
              </span>
            </div>
          </motion.div>

          {/* Bottom decorative line */}
          <motion.div variants={fadeUp} className="mt-20 flex items-center gap-4">
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, var(--border-card))" }} />
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <Sparkles size={12} className="text-violet-800" />
              Duolync — AI Influencer Marketing Platform
            </div>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, var(--border-card))" }} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
