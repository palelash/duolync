"use client";

import { useRef, useState } from "react";
import { motion, useInView, AnimatePresence, type Variants } from "framer-motion";
import { Plus, Minus, Sparkles } from "lucide-react";

const fadeUp: Variants = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0 } };
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const PURPLE = "#a78bfa";
const PURPLE_T = "var(--accent-violet-text)";

const faqs = [
  { question: "What is Duolync?", answer: "Duolync is a two-sided marketplace that connects content creators with brands for genuine collaboration opportunities. Brands can discover and manage creator campaigns, while creators get access to curated brand deals matched to their niche and audience." },
  { question: "How do I get started as a creator?", answer: "Sign up, complete your profile, and connect your YouTube, TikTok, or Instagram account. We'll start surfacing relevant brand opportunities based on your niche, audience, and engagement — no complex setup required." },
  { question: "Is Duolync free to use?", answer: "Yes. We offer a free plan for both brands and creators with access to core features. Advanced tools and priority placement are available on premium plans. No credit card is required to get started." },
  { question: "How does creator matching work?", answer: "Our matching system analyses creator profiles including audience demographics, engagement quality, content style, and niche alignment to surface relevant opportunities for brands. Brands can also search and filter directly to find the right fit." },
  { question: "Which platforms are supported?", answer: "Duolync supports TikTok, YouTube, and Instagram. Creators can connect one or more of these accounts to build their public portfolio and get matched with relevant brand campaigns." },
  { question: "How do deals and payments work?", answer: "Brands post collaboration offers with budgets, and creators can apply or accept invites directly through the platform. Payment terms and deliverables are agreed between brand and creator — Duolync provides the tools to manage the deal, not a payment processor." },
  { question: "What kind of brands can use Duolync?", answer: "Any brand looking to work with content creators — from early-stage startups and e-commerce stores to established marketing teams. Our tools are designed to be useful whether you're running your first creator campaign or managing multiple ongoing partnerships." },
  { question: "How is my data protected?", answer: "Your personal information is never sold or shared without your consent. We comply with GDPR and CCPA. Social account connections use read-only OAuth access — we only read public stats to power your portfolio and matching. See our Privacy Policy for full details." },
];

export function FAQSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-28 relative overflow-hidden" style={{ background: "var(--bg-page-alt)" }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(124,58,237,0.4), transparent)" }} />

      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 max-w-6xl mx-auto">
          {/* Left: title */}
          <motion.div
            ref={ref}
            initial={{ opacity: 0, x: -24 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7 }}
            className="lg:col-span-4"
          >
            <div className="lg:sticky lg:top-28">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5" style={{ background: "var(--glow-purple)", border: "1px solid rgba(124,58,237,0.3)", color: PURPLE_T }}>
                <Sparkles size={11} />
                FAQ
              </div>
              <h2 className="font-display font-bold text-white text-3xl md:text-4xl leading-tight mb-4">
                Frequently<br />
                <span style={{ background: `linear-gradient(90deg, ${PURPLE}, #67e8f9)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  asked questions
                </span>
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Can't find your answer? Reach out to our team and we'll get back to you within 24 hours.
              </p>
              <a
                href="mailto:hello@duolync.com"
                className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium transition-all"
                style={{ color: PURPLE_T }}
              >
                Contact support →
              </a>
            </div>
          </motion.div>

          {/* Right: accordion */}
          <motion.div
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={stagger}
            className="lg:col-span-8 space-y-2"
          >
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: open === i ? "var(--glow-purple)" : "var(--bg-card)",
                  border: `1px solid ${open === i ? "rgba(124,58,237,0.3)" : "var(--border-card)"}`,
                }}
              >
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  <span className={`text-sm font-medium flex-1 transition-colors ${open === i ? "text-white" : "text-slate-300"}`}>
                    {faq.question}
                  </span>
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                    style={{ background: open === i ? "rgba(124,58,237,0.25)" : "var(--bg-card-hover)", border: `1px solid ${open === i ? "rgba(124,58,237,0.4)" : "var(--border-card-strong)"}` }}
                  >
                    {open === i
                      ? <Minus size={12} style={{ color: PURPLE_T }} />
                      : <Plus size={12} className="text-slate-500" />
                    }
                  </div>
                </button>

                <AnimatePresence>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed" style={{ borderTop: "1px solid var(--bg-card-hover)" }}>
                        <div className="pt-4">{faq.answer}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
