"use client";

import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });

      if (error) throw new Error(error.message);

      setSent(true);
    } catch (err) {
      toast({
        title: "Something went wrong",
        description:
          err instanceof Error ? err.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const maskedEmail = email
    ? email.replace(
        /^(.{2})(.*)(@.*)$/,
        (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c,
      )
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
              <span className="text-white font-bold text-xl leading-none">
                D
              </span>
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
            sent
              ? "border-emerald-500/30 bg-emerald-500/[0.04]"
              : "border-white/[0.08] bg-white/[0.03]",
          ].join(" ")}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/[0.06] via-transparent to-pink-500/[0.04] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            {sent ? (
              /* ── Success state ── */
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/40 bg-gradient-to-br from-emerald-500/25 to-teal-500/20">
                  <CheckCircle className="w-7 h-7 text-emerald-400" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Check your inbox
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed mb-1">
                  We sent a password reset link to
                </p>
                {maskedEmail && (
                  <p className="font-semibold text-foreground text-sm mb-5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]">
                    {maskedEmail}
                  </p>
                )}
                <p className="text-muted-foreground text-xs leading-relaxed max-w-[320px]">
                  The link expires in{" "}
                  <span className="text-foreground/80 font-medium">
                    1 hour
                  </span>
                  . If you don&apos;t see it, check your spam folder.
                </p>
              </>
            ) : (
              /* ── Request form ── */
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-pink-500/20">
                  <Mail className="w-7 h-7 text-violet-300" />
                </div>

                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Forgot your password?
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-[320px]">
                  Enter the email address associated with your account and
                  we&apos;ll send you a reset link.
                </p>

                <form onSubmit={handleSubmit} className="w-full space-y-4">
                  <div className="space-y-1.5 text-left">
                    <label
                      htmlFor="email"
                      className="text-sm font-medium text-foreground/80"
                    >
                      Email address
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      className="h-11 bg-white/[0.04] border-white/[0.10] focus:border-violet-500/50 focus:ring-violet-500/20 placeholder:text-muted-foreground/40"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full h-11 font-semibold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 border-0 transition-all duration-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Sending…
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Back to sign-in */}
        <div className="flex justify-center mt-6">
          <Link
            href="/auth"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
