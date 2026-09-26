"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, RefreshCw, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const POLL_INTERVAL_MS = 3000;
const REDIRECT_DELAY_MS = 1800;

export default function VerifyEmailNotification() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams?.get("email") ?? "";
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [verified, setVerified] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reactive session — Better Auth re-renders this on focus / cookie change
  const { data: session, refetch } = authClient.useSession();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleVerified = useCallback(() => {
    stopPolling();
    setVerified(true);
    // Brief success flash, then send to onboarding
    setTimeout(() => router.replace("/onboarding"), REDIRECT_DELAY_MS);
  }, [stopPolling, router]);

  // Check the session object whenever it changes (reactive path)
  useEffect(() => {
    if (session?.user?.emailVerified && !verified) {
      handleVerified();
    }
  }, [session, verified, handleVerified]);

  // Polling path: force-refetch every POLL_INTERVAL_MS so we catch the
  // verification even when the tab stays in the background.
  useEffect(() => {
    if (verified) return;

    pollRef.current = setInterval(() => {
      refetch();
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [verified, refetch, stopPolling]);

  const handleResend = async () => {
    if (!email) {
      toast({
        title: "No email address found",
        description: "Please go back and sign up again.",
        variant: "destructive",
      });
      return;
    }
    setResending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/email-verified",
      });
      if (error) throw new Error(error.message);
      setResent(true);
      toast({
        title: "Email resent!",
        description: "Check your inbox for the new verification link.",
      });
    } catch (err) {
      toast({
        title: "Failed to resend",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c)
    : null;

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute -bottom-52 -left-52 w-[680px] h-[680px] rounded-full bg-violet-600/[0.12] blur-[130px] pointer-events-none" />
      <div className="absolute -top-48 -right-48 w-[560px] h-[560px] rounded-full bg-cyan-500/[0.08] blur-[110px] pointer-events-none" />
      <div className="absolute top-[40%] right-[15%] w-[360px] h-[360px] rounded-full bg-fuchsia-700/[0.06] blur-[90px] pointer-events-none" />

      <div className="w-full max-w-[460px] z-10">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/15">
              <span className="text-white font-bold text-xl leading-none">D</span>
            </div>
            <span
              className="font-display font-bold text-2xl tracking-tight"
              style={{
                background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Duolync
            </span>
          </Link>
        </div>

        {/* Glass card */}
        <div
          className={[
            "relative rounded-2xl border backdrop-blur-xl p-8 md:p-10 shadow-2xl transition-all duration-500",
            verified
              ? "border-emerald-500/30 bg-emerald-500/[0.04]"
              : "border-white/[0.08] bg-white/[0.03]",
          ].join(" ")}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/[0.06] via-transparent to-pink-500/[0.04] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">

            {verified ? (
              /* ── Verified flash ── */
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/40 bg-gradient-to-br from-emerald-500/25 to-teal-500/20">
                  <CheckCircle className="w-7 h-7 text-emerald-400" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Email verified!
                </h1>
                <p className="text-muted-foreground text-sm">
                  Taking you to your dashboard…
                </p>
              </>
            ) : (
              /* ── Waiting state ── */
              <>
                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-pink-500/20">
                  <Mail className="w-7 h-7 text-violet-300" />
                </div>

                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Check your inbox
                </h1>

                <p className="text-muted-foreground text-sm leading-relaxed mb-1">
                  We&apos;ve sent a verification link to
                </p>

                {maskedEmail && (
                  <p className="font-semibold text-foreground text-sm mb-5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]">
                    {maskedEmail}
                  </p>
                )}

                <p className="text-muted-foreground text-xs leading-relaxed mb-6 max-w-[320px]">
                  Click the link in the email to verify your account. The link expires in{" "}
                  <span className="text-foreground/80 font-medium">24 hours</span>.
                </p>

                {/* Auto-detect indicator */}
                <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-muted-foreground">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                  </span>
                  Waiting for verification — this page will update automatically
                </div>

                {/* Steps hint */}
                <div className="w-full space-y-2.5 mb-8 text-left">
                  {[
                    "Open the email from Duolync",
                    "Click \u201cVerify Email Address\u201d",
                    "You\u2019ll be redirected here automatically",
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-violet-300">{i + 1}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>

                {/* Resend button */}
                <Button
                  onClick={handleResend}
                  disabled={resending || resent}
                  variant="outline"
                  className="w-full h-11 gap-2 border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.20] transition-all backdrop-blur-sm disabled:opacity-50"
                >
                  {resent ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Email resent!</span>
                    </>
                  ) : resending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Resend verification email
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Back link — hidden once verified */}
        {!verified && (
          <div className="flex justify-center mt-6">
            <Link
              href="/auth"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
