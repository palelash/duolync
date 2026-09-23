"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Sparkles, Shield } from "lucide-react";

export function BrandWaitlistModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const params = new URLSearchParams({ email: email.trim(), role: "brand" });
    router.push(`/auth?${params.toString()}`);
    onClose();
  }

  return (
    <motion.div
      key="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <motion.div
        key="card"
        initial={{ opacity: 0, scale: 0.91, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.91, y: 20 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-3xl p-8 overflow-hidden"
        style={{
          background: "linear-gradient(150deg, rgba(8,8,20,0.99) 0%, rgba(5,15,30,0.99) 100%)",
          border: "1px solid rgba(6,182,212,0.3)",
          boxShadow: "0 0 80px rgba(8,145,178,0.14), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient top glow */}
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-44 rounded-full blur-[72px] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(8,145,178,0.22) 0%, rgba(124,58,237,0.12) 55%, transparent 100%)" }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <X size={14} className="text-slate-400" />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {/* Icon */}
            <div className="flex justify-center mb-5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(8,145,178,0.3), rgba(124,58,237,0.25))",
                  border: "1px solid rgba(6,182,212,0.35)",
                }}
              >
                <Sparkles size={22} style={{ color: "var(--accent-cyan-text)" }} />
              </div>
            </div>

            {/* Heading */}
            <h3 className="font-display font-bold text-white text-2xl text-center leading-snug mb-3">
              Create Your Duolync Account
            </h3>

            {/* Subtext */}
            <p className="text-slate-400 text-sm text-center leading-relaxed mb-6">
              Discover verified creator profiles across TikTok, Instagram,
              and YouTube. Start for free — no credit card required.
            </p>

            {/* Social proof bar */}
            <div
              className="flex items-center justify-between mb-5 py-2.5 px-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {["#7dd3fc", "#a78bfa", "#34d399", "#f472b6"].map((c, i) => (
                    <div key={i} className="w-6 h-6 rounded-full border-[1.5px]" style={{ background: c, borderColor: "rgba(8,8,20,0.99)" }} />
                  ))}
                </div>
                <span className="text-[11px] text-slate-500">
                  Brands already on Duolync
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <Shield size={10} className="text-cyan-400" />
                Privacy protected
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200 focus-within:border-cyan-500/50"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <Mail size={14} className="text-slate-600 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@company.com"
                  required
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:scale-[1.02] hover:opacity-95 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #0891b2, #7c3aed)" }}
              >
                Get Started →
              </button>
            </form>

            <p className="text-center text-[10px] text-slate-700 mt-4">
              No credit card required. Cancel any time.
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
