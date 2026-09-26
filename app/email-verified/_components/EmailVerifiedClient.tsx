"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";

type State = "loading" | "success" | "error";

const REDIRECT_DELAY_MS = 3500;

export default function EmailVerifiedClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [state, setState] = useState<State>("loading");
  const [countdown, setCountdown] = useState(Math.round(REDIRECT_DELAY_MS / 1000));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Better Auth appends `?error=...` on failure, otherwise the token is consumed
  // and the user's session is active.
  const errorParam = searchParams?.get("error");

  useEffect(() => {
    if (errorParam) {
      setState("error");
      return;
    }

    // Wait for the session to resolve to confirm verification succeeded
    if (!isPending) {
      if (session?.user?.emailVerified) {
        setState("success");
      } else if (session?.user && !session.user.emailVerified) {
        // Signed in but not yet verified — token may be invalid/expired
        setState("error");
      } else if (!session) {
        // No session yet — give Better Auth a moment to hydrate, then error
        const timeout = setTimeout(() => setState("error"), 3000);
        return () => clearTimeout(timeout);
      }
    }
  }, [isPending, session, errorParam]);

  // Auto-redirect after success
  useEffect(() => {
    if (state !== "success") return;

    const role = (session?.user as { role?: string } | undefined)?.role;
    const hasOnboarded = (session?.user as { hasCompletedOnboarding?: boolean } | undefined)?.hasCompletedOnboarding;
    const destination = hasOnboarded
      ? role?.toLowerCase() === "brand"
        ? "/brand/dashboard"
        : "/creator/dashboard"
      : "/onboarding";

    // Countdown timer
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    timerRef.current = setTimeout(() => {
      clearInterval(interval);
      router.replace(destination);
    }, REDIRECT_DELAY_MS);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, session, router]);

  const errorMessage = errorParam
    ? decodeURIComponent(errorParam).replace(/_/g, " ")
    : "The verification link may have expired or already been used.";

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute -bottom-52 -left-52 w-[680px] h-[680px] rounded-full bg-violet-600/[0.12] blur-[130px] pointer-events-none" />
      <div className="absolute -top-48 -right-48 w-[560px] h-[560px] rounded-full bg-cyan-500/[0.08] blur-[110px] pointer-events-none" />
      <div className="absolute top-[40%] right-[15%] w-[360px] h-[360px] rounded-full bg-fuchsia-700/[0.06] blur-[90px] pointer-events-none" />

      <div className="w-full max-w-[440px] z-10">
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
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-8 md:p-10 shadow-2xl">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/[0.05] via-transparent to-pink-500/[0.03] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            {state === "loading" && (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-pink-500/20">
                  <Loader2 className="w-7 h-7 text-violet-300 animate-spin" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Verifying…
                </h1>
                <p className="text-muted-foreground text-sm">
                  Please wait while we confirm your email address.
                </p>
              </>
            )}

            {state === "success" && (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                  <CheckCircle className="w-7 h-7 text-emerald-400" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Email verified!
                </h1>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                  Your email has been confirmed. Welcome to Duolync!
                </p>

                {/* Progress bar */}
                <div className="w-full mb-4">
                  <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{
                        width: `${((Math.round(REDIRECT_DELAY_MS / 1000) - countdown) / Math.round(REDIRECT_DELAY_MS / 1000)) * 100}%`,
                        transition: "width 1s linear",
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Redirecting in <span className="text-foreground font-semibold">{countdown}s</span>…
                </p>
              </>
            )}

            {state === "error" && (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-red-500/30 bg-gradient-to-br from-red-500/20 to-orange-500/20">
                  <XCircle className="w-7 h-7 text-red-400" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Verification failed
                </h1>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed capitalize">
                  {errorMessage}
                </p>
                <div className="flex flex-col gap-2.5 w-full">
                  <Button
                    asChild
                    className="w-full h-11 btn-gradient font-semibold"
                  >
                    <Link href="/auth">Back to sign in</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full h-11 border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06]"
                  >
                    <Link href="/verify-email">Resend verification email</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
