"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KeyRound, ArrowLeft, CheckCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordTooShort =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;
  const isValid =
    password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValid || !token) return;

    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (error) throw new Error(error.message);

      setDone(true);
      toast({
        title: "Password updated!",
        description: "You can now sign in with your new password.",
      });

      setTimeout(() => router.replace("/auth"), 2500);
    } catch (err) {
      toast({
        title: "Reset failed",
        description:
          err instanceof Error
            ? err.message
            : "The link may have expired. Please request a new one.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute -bottom-52 -left-52 w-[680px] h-[680px] rounded-full bg-violet-600/[0.12] blur-[130px] pointer-events-none" />
        <div className="absolute -top-48 -right-48 w-[560px] h-[560px] rounded-full bg-cyan-500/[0.08] blur-[110px] pointer-events-none" />

        <div className="w-full max-w-[460px] z-10">
          <div className="flex justify-center mb-10">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/15">
                <span className="text-white font-bold text-xl leading-none">D</span>
              </div>
              <span
                className="font-display font-bold text-2xl tracking-tight"
                style={{
                  background:
                    "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Duolync
              </span>
            </Link>
          </div>

          <div className="relative rounded-2xl border border-red-500/30 bg-red-500/[0.04] backdrop-blur-xl p-8 md:p-10 shadow-2xl text-center">
            <p className="text-foreground font-semibold mb-2">
              Invalid reset link
            </p>
            <p className="text-muted-foreground text-sm mb-6">
              This link is missing a reset token. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-4"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
            done
              ? "border-emerald-500/30 bg-emerald-500/[0.04]"
              : "border-white/[0.08] bg-white/[0.03]",
          ].join(" ")}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/[0.06] via-transparent to-pink-500/[0.04] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            {done ? (
              /* ── Success state ── */
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/40 bg-gradient-to-br from-emerald-500/25 to-teal-500/20">
                  <CheckCircle className="w-7 h-7 text-emerald-400" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Password updated!
                </h1>
                <p className="text-muted-foreground text-sm">
                  Redirecting you to sign in…
                </p>
              </>
            ) : (
              /* ── Reset form ── */
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-pink-500/20">
                  <KeyRound className="w-7 h-7 text-violet-300" />
                </div>

                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  Choose a new password
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-[320px]">
                  Your new password must be at least{" "}
                  <span className="text-foreground/80 font-medium">
                    {MIN_PASSWORD_LENGTH} characters
                  </span>{" "}
                  long.
                </p>

                <form onSubmit={handleSubmit} className="w-full space-y-4">
                  {/* New password */}
                  <div className="space-y-1.5 text-left">
                    <label
                      htmlFor="password"
                      className="text-sm font-medium text-foreground/80"
                    >
                      New password
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className={[
                          "h-11 pr-10 bg-white/[0.04] border-white/[0.10] placeholder:text-muted-foreground/40",
                          passwordTooShort
                            ? "border-red-500/50 focus:border-red-500/70"
                            : "focus:border-violet-500/50 focus:ring-violet-500/20",
                        ].join(" ")}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {passwordTooShort && (
                      <p className="text-xs text-red-400">
                        Password must be at least {MIN_PASSWORD_LENGTH}{" "}
                        characters.
                      </p>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1.5 text-left">
                    <label
                      htmlFor="confirm-password"
                      className="text-sm font-medium text-foreground/80"
                    >
                      Confirm password
                    </label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repeat your password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={loading}
                        className={[
                          "h-11 pr-10 bg-white/[0.04] border-white/[0.10] placeholder:text-muted-foreground/40",
                          passwordMismatch
                            ? "border-red-500/50 focus:border-red-500/70"
                            : "focus:border-violet-500/50 focus:ring-violet-500/20",
                        ].join(" ")}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={
                          showConfirm
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        {showConfirm ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {passwordMismatch && (
                      <p className="text-xs text-red-400">
                        Passwords do not match.
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !isValid}
                    className="w-full h-11 font-semibold bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 border-0 transition-all duration-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Updating…
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Back to sign-in */}
        {!done && (
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
