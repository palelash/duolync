"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Building2, User, Mail, ArrowRight, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { useWaitlist } from "./WaitlistContext";

type Role = "brand" | "creator";
type Step = "select" | "form" | "success";

export function WaitlistModal() {
  const { isOpen, preselectedRole, closeWaitlist } = useWaitlist();
  const [step, setStep] = useState<Step>("select");
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (preselectedRole) {
        setRole(preselectedRole);
        setStep("form");
      } else {
        setStep("select");
        setRole(null);
      }
      setEmail("");
      setError("");
    }
  }, [isOpen, preselectedRole]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleClose = () => {
    closeWaitlist();
    setTimeout(() => {
      setStep("select");
      setRole(null);
      setEmail("");
      setError("");
    }, 300);
  };

  const handleSelectRole = (r: Role) => {
    setRole(r);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || !email) return;
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setStep("success");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const roleLabel = role === "brand" ? "Brand" : "Creator";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
        >
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md rounded-3xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 0 60px rgba(124,58,237,0.2), 0 0 120px rgba(8,145,178,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Ambient glow inside modal */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
              <div
                className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-[80px]"
                style={{ background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)" }}
              />
              <div
                className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full blur-[80px]"
                style={{ background: "radial-gradient(circle, rgba(8,145,178,0.2) 0%, transparent 70%)" }}
              />
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="relative p-8">
              <AnimatePresence mode="wait">
                {/* Step 1: Role Selection */}
                {step === "select" && (
                  <motion.div
                    key="select"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
                      >
                        <Sparkles size={14} className="text-white" />
                      </div>
                      <span className="text-xs font-medium" style={{ color: "#c4b5fd" }}>
                        Get Started
                      </span>
                    </div>

                    <h2 className="font-display font-bold text-2xl text-white mb-1">
                      Join Duolync
                    </h2>
                    <p className="text-slate-400 text-sm mb-8">
                      Connect with verified creators or brands. Choose your role to get started.
                    </p>

                    <div className="space-y-3">
                      <button
                        onClick={() => handleSelectRole("brand")}
                        className="group w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] text-left"
                        style={{
                          background: "rgba(124,58,237,0.08)",
                          border: "1px solid rgba(124,58,237,0.25)",
                        }}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                          style={{ background: "rgba(124,58,237,0.15)" }}
                        >
                          <Building2 size={22} style={{ color: "#a78bfa" }} />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-white text-sm mb-0.5">
                            Join as a Brand
                          </div>
                          <div className="text-xs text-slate-500">
                            Find &amp; collaborate with creators
                          </div>
                        </div>
                        <ArrowRight
                          size={16}
                          className="transition-transform group-hover:translate-x-1"
                          style={{ color: "#a78bfa" }}
                        />
                      </button>

                      <button
                        onClick={() => handleSelectRole("creator")}
                        className="group w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] text-left"
                        style={{
                          background: "rgba(236,72,153,0.08)",
                          border: "1px solid rgba(236,72,153,0.25)",
                        }}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(236,72,153,0.15)" }}
                        >
                          <User size={22} style={{ color: "#f472b6" }} />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-white text-sm mb-0.5">
                            Join as a Creator
                          </div>
                          <div className="text-xs text-slate-500">
                            Get discovered by top brands
                          </div>
                        </div>
                        <ArrowRight
                          size={16}
                          className="transition-transform group-hover:translate-x-1"
                          style={{ color: "#f472b6" }}
                        />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Email Form */}
                {step === "form" && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <button
                      onClick={() => { setStep("select"); setError(""); }}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-6"
                    >
                      ← Back
                    </button>

                    <div className="flex items-center gap-3 mb-6">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: role === "brand"
                            ? "rgba(124,58,237,0.15)"
                            : "rgba(236,72,153,0.15)",
                        }}
                      >
                        {role === "brand"
                          ? <Building2 size={18} style={{ color: "#a78bfa" }} />
                          : <User size={18} style={{ color: "#f472b6" }} />
                        }
                      </div>
                      <div>
                        <h2 className="font-display font-bold text-xl text-white">
                          Join as a {roleLabel}
                        </h2>
                        <p className="text-slate-500 text-xs">Enter your email to get started</p>
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="relative">
                        <Mail
                          size={16}
                          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ color: "#475569" }}
                        />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setError(""); }}
                          placeholder="you@example.com"
                          required
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:ring-2"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.border = "1px solid rgba(124,58,237,0.6)";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.15)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />
                      </div>

                      {error && (
                        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                          {error}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={isLoading || !email}
                        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-white text-sm transition-all duration-200 hover:scale-[1.02] hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                        style={{
                          background: "linear-gradient(135deg, #7c3aed, #0891b2)",
                          boxShadow: "0 0 24px rgba(124,58,237,0.35)",
                        }}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Joining...
                          </>
                        ) : (
                          <>
                            <Sparkles size={15} />
                            Get Started
                            <ArrowRight size={15} />
                          </>
                        )}
                      </button>
                    </form>

                    <p className="text-center text-xs text-slate-600 mt-4">
                      No spam, ever. We respect your privacy.
                    </p>
                  </motion.div>
                )}

                {/* Step 3: Success */}
                {step === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center py-4"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, duration: 0.4, type: "spring", stiffness: 200 }}
                      className="flex justify-center mb-5"
                    >
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(8,145,178,0.2))",
                          border: "1px solid rgba(124,58,237,0.4)",
                          boxShadow: "0 0 32px rgba(124,58,237,0.3)",
                        }}
                      >
                        <CheckCircle2 size={32} style={{ color: "#a78bfa" }} />
                      </div>
                    </motion.div>

                    <h2 className="font-display font-bold text-2xl text-white mb-2">
                      You&apos;re in!
                    </h2>
                    <p className="text-slate-400 text-sm mb-2">
                      We&apos;ll be in touch soon with your next steps.
                    </p>
                    <p className="text-slate-600 text-xs mb-8">
                      Joined as a <span style={{ color: role === "brand" ? "#a78bfa" : "#f472b6" }}>{roleLabel}</span>
                    </p>

                    <button
                      onClick={handleClose}
                      className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#94a3b8",
                      }}
                    >
                      Close
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
