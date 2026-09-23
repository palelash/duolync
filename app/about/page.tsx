import Link from "next/link";
import Navbar from "@/app/_components/layout/Navbar";
import Footer from "@/app/_components/layout/Footer";

export const metadata = {
  title: "About Us — Duolync",
  description:
    "Learn about Duolync's mission to bridge the gap between brands and content creators through AI-powered matching and smart collaboration tools.",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const VALUES = [
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
        />
      </svg>
    ),
    title: "AI-First",
    body: "Every feature is built around AI — from smart creator matching to campaign optimization and growth mentorship.",
    accent: "#a78bfa",
    accentBg: "rgba(167,139,250,0.08)",
    accentBorder: "rgba(167,139,250,0.2)",
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
        />
      </svg>
    ),
    title: "Creator-Centric",
    body: "Creators deserve real tools — not just a discovery page. We give them verified analytics, deal filters, and AI-driven insights that help them grow.",
    accent: "#ec4899",
    accentBg: "rgba(236,72,153,0.08)",
    accentBorder: "rgba(236,72,153,0.2)",
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"
        />
      </svg>
    ),
    title: "Data-Driven",
    body: "Gut feelings don't scale. Every match, deal, and campaign decision on Duolync is backed by real performance data.",
    accent: "#34d399",
    accentBg: "rgba(52,211,153,0.08)",
    accentBorder: "rgba(52,211,153,0.2)",
  },
  {
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
        />
      </svg>
    ),
    title: "Trust & Transparency",
    body: "We verify creator profiles against their real public data, so both sides of every deal can make informed decisions and collaborate with confidence.",
    accent: "#67e8f9",
    accentBg: "rgba(103,232,249,0.08)",
    accentBorder: "rgba(103,232,249,0.2)",
  },
];

const STATS = [
  { value: "2", label: "Co-founders" },
  { value: "4+", label: "Core features" },
  { value: "2026", label: "Founded" },
  { value: "🌍", label: "Tbilisi, Georgia" },
];


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      {/* Navbar */}
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "var(--bg-navbar)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <Navbar />
      </div>

      <main className="pt-32 pb-24">
        {/* ── Ambient background ── */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          aria-hidden
        >
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-[180px]"
            style={{
              background:
                "radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-1/3 right-0 w-[400px] h-[400px] rounded-full blur-[140px]"
            style={{
              background:
                "radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, var(--dot-grid) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
        </div>

        <div className="relative container mx-auto px-4 max-w-5xl">
          {/* ══════════════════════════════════════════════════
              SECTION 1 — Hero
          ══════════════════════════════════════════════════ */}
          <section className="text-center mb-24">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-6"
              style={{
                background: "rgba(167,139,250,0.08)",
                border: "1px solid rgba(167,139,250,0.2)",
                color: "#a78bfa",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Our story
            </span>

            <h1
              className="font-display font-bold text-white mb-6"
              style={{
                fontSize: "clamp(2.4rem, 5.5vw, 4rem)",
                lineHeight: 1.08,
              }}
            >
              Shaking up the{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #a78bfa, #ec4899)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Creator Economy
              </span>
            </h1>

            <p className="text-slate-400 text-lg leading-relaxed max-w-2xl mx-auto mb-10">
              Duolync is the AI-powered marketplace that finally puts brands and
              creators on equal footing — replacing spreadsheets and cold DMs
              with smart matching, real analytics, and seamless collaboration.
            </p>

            {/* Stats row */}
            <div
              className="inline-flex flex-wrap items-center justify-center gap-px rounded-2xl overflow-hidden"
              style={{ border: "1px solid var(--border-card)" }}
            >
              {STATS.map((s, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center px-8 py-5"
                  style={{ background: "var(--bg-card)" }}
                >
                  <span className="font-display font-bold text-2xl text-white">
                    {s.value}
                  </span>
                  <span className="text-xs text-zinc-500 mt-1 whitespace-nowrap">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 2 — Story / Why we built this
          ══════════════════════════════════════════════════ */}
          <section className="mb-24">
            <div
              className="rounded-3xl p-10 md:p-14 grid grid-cols-1 md:grid-cols-2 gap-12 items-center"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-card)",
              }}
            >
              {/* Left — text */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">
                  Why we built this
                </p>
                <h2
                  className="font-display font-bold text-white mb-5"
                  style={{
                    fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
                    lineHeight: 1.2,
                  }}
                >
                  The gap was obvious.
                  <br />
                  <span className="text-zinc-500">Nobody was fixing it.</span>
                </h2>
                <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
                  <p>
                    We watched brands waste thousands chasing influencers who
                    didn&apos;t fit — and creators accept lowball deals because
                    they had no leverage and no data. The tools that existed
                    were either built for agencies or completely ignored the
                    creator&apos;s side of the equation.
                  </p>
                  <p>
                    So we built Duolync. A marketplace where AI does the heavy
                    lifting: matching brands to the right creators by audience
                    fit, engagement quality, and campaign ROI — not follower
                    count.
                  </p>
                  <p>
                    And for creators, we built a real platform: cross-platform
                    analytics, a smart deal inbox, deal tracking tools, and
                    AI-powered insights that help you grow.
                  </p>
                </div>
              </div>

              {/* Right — pull quote */}
              <div className="flex flex-col gap-5">
                <blockquote
                  className="rounded-2xl p-7 relative"
                  style={{
                    background: "rgba(167,139,250,0.06)",
                    border: "1px solid rgba(167,139,250,0.18)",
                  }}
                >
                  <div
                    className="text-5xl font-display font-black leading-none mb-3 select-none"
                    style={{ color: "rgba(167,139,250,0.25)" }}
                  >
                    &ldquo;
                  </div>
                  <p className="text-white text-base font-medium leading-relaxed">
                    We&apos;re not just building a marketplace. We&apos;re
                    building the operating system for the creator economy.
                  </p>
                  <p className="text-violet-400 text-xs font-semibold uppercase tracking-wider mt-4">
                    — Duolync Team
                  </p>
                </blockquote>

                {/* Mini feature list */}
                <div className="space-y-3">
                  {[
                    {
                      label: "AI-powered brand ↔ creator matching",
                      color: "#a78bfa",
                    },
                    {
                      label: "Cross-platform analytics dashboard",
                      color: "#ec4899",
                    },
                    {
                      label: "Campaign management & deal tracking",
                      color: "#34d399",
                    },
                    {
                      label: "AI growth tools for creators (Beta)",
                      color: "#67e8f9",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: item.color }}
                      />
                      <span className="text-sm text-zinc-400">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 3 — Values
          ══════════════════════════════════════════════════ */}
          <section className="mb-24">
            <div className="text-center mb-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-3">
                What we stand for
              </p>
              <h2
                className="font-display font-bold text-white"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}
              >
                Principles we build by
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {VALUES.map((v) => (
                <div
                  key={v.title}
                  className="rounded-2xl p-6 flex gap-5"
                  style={{
                    background: v.accentBg,
                    border: `1px solid ${v.accentBorder}`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${v.accent}18`, color: v.accent }}
                  >
                    {v.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-1.5">
                      {v.title}
                    </h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      {v.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>


          {/* ══════════════════════════════════════════════════
              SECTION 5 — CTA
          ══════════════════════════════════════════════════ */}
          <section>
            <div
              className="rounded-3xl px-10 py-16 text-center relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(236,72,153,0.1) 100%)",
                border: "1px solid rgba(167,139,250,0.2)",
              }}
            >
              {/* Glow */}
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 65%)",
                }}
                aria-hidden
              />

              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">
                  Get started
                </p>
                <h2
                  className="font-display font-bold text-white mb-4"
                  style={{
                    fontSize: "clamp(1.7rem, 3.5vw, 2.5rem)",
                    lineHeight: 1.15,
                  }}
                >
                  Join the platform
                </h2>
                <p className="text-slate-400 text-base max-w-md mx-auto mb-8 leading-relaxed">
                  Sign up today and start connecting brands with creators
                  across YouTube, TikTok, and Instagram.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href="/auth"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white text-sm transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
                    style={{
                      background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                      boxShadow: "0 0 32px rgba(124,58,237,0.25)",
                    }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                      />
                    </svg>
                    Create your account
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl text-sm font-medium text-zinc-400 transition-all duration-200 hover:text-white hover:scale-[1.01]"
                    style={{
                      background: "var(--bg-card-hover)",
                      border: "1px solid var(--border-card-strong)",
                    }}
                  >
                    Talk to the team
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
