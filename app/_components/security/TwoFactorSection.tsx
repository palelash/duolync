"use client";

import { useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldOff, Copy, Check, Loader2, Key,
  Smartphone, AlertTriangle, RefreshCw, ChevronDown, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | "idle"
  | "enable-password"   // step 1: password confirmation
  | "enable-qr"         // step 2: scan QR + enter code to verify & activate
  | "enable-done"       // step 3: show backup codes after successful activation
  | "disable-confirm"   // password confirmation for disable
  | "regen-confirm"     // password confirmation for backup-code regeneration
  | "regen-codes";      // show newly-generated backup codes

interface TwoFactorSectionProps {
  accentColor?: "violet" | "cyan";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TwoFactorSection({ accentColor = "violet" }: TwoFactorSectionProps) {
  const { data: session, refetch } = useSession();

  const sessionEnabled =
    (session?.user as { twoFactorEnabled?: boolean } | null | undefined)
      ?.twoFactorEnabled ?? false;

  // Local flag is the single source of truth for the UI.
  // Seeded from the session and updated optimistically after every mutating call.
  const [isEnabled, setIsEnabled] = useState(sessionEnabled);
  useEffect(() => { setIsEnabled(sessionEnabled); }, [sessionEnabled]);

  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [totpUri, setTotpUri] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [manualKeyOpen, setManualKeyOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const accent = {
    btn:
      accentColor === "cyan"
        ? "bg-cyan-600 hover:bg-cyan-700 text-white"
        : "btn-gradient",
    text:
      accentColor === "cyan"
        ? "text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300"
        : "text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300",
  };

  // Reset all transient state and return to idle.
  function reset() {
    setStep("idle");
    setPassword("");
    setShowPw(false);
    setTotpUri("");
    setVerifyCode("");
    setBackupCodes([]);
    setCopiedAll(false);
    setManualKeyOpen(false);
  }

  const qrUrl = totpUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=192x192&margin=8&data=${encodeURIComponent(totpUri)}`
    : "";

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Step 1 → Step 2: call enable() to generate the TOTP secret.
  // NOTE: enable() does NOT yet set twoFactorEnabled=true — that only happens
  // in handleVerifySetup() below when verifyTotp() validates the first code.
  function handleEnable() {
    if (!password) return;
    startTransition(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error ?? !data) {
        toast.error(error?.message ?? "Failed to start 2FA setup — check your password");
        return;
      }
      setTotpUri(data.totpURI);
      setBackupCodes(data.backupCodes);
      setPassword("");
      setVerifyCode("");
      setStep("enable-qr");
    });
  }

  // Step 2 → Step 3: verify the first TOTP code.
  // verifyTotp() when called while the user is already logged in:
  //   • validates the code against the stored secret
  //   • sets User.twoFactorEnabled = true in the DB
  //   • sets TwoFactor.verified = true
  //   • refreshes the session cookie with the updated user
  function handleVerifySetup() {
    if (verifyCode.length !== 6) return;
    startTransition(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code: verifyCode });
      if (error) {
        toast.error(error.message ?? "Invalid code — please try again");
        setVerifyCode("");
        return;
      }
      // 2FA is now fully active in the DB; update local state immediately.
      setIsEnabled(true);
      void refetch();
      setStep("enable-done");
      toast.success("Two-factor authentication enabled!");
    });
  }

  // Disable 2FA.
  function handleDisable() {
    if (!password) return;
    startTransition(async () => {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) {
        toast.error(error.message ?? "Failed to disable 2FA — check your password");
        return;
      }
      setIsEnabled(false);
      void refetch();
      toast.success("Two-factor authentication disabled");
      reset();
    });
  }

  // Generate new backup codes.
  function handleRegenerate() {
    if (!password) return;
    startTransition(async () => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error ?? !data) {
        toast.error(error?.message ?? "Failed to regenerate codes — check your password");
        return;
      }
      setBackupCodes(data.backupCodes);
      setPassword("");
      setStep("regen-codes");
    });
  }

  async function handleCopyAll(codes: string[]) {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success("Backup codes copied to clipboard");
  }

  async function handleCopyOne(code: string, idx: number) {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  }

  // ── Shared UI pieces ────────────────────────────────────────────────────────

  function PasswordInput({ onSubmit }: { onSubmit: () => void }) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Confirm your password to continue
        </Label>
        <div className="relative">
          <Input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="••••••••"
            className="rounded-xl pr-9"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  function BackupCodesGrid({ codes }: { codes: string[] }) {
    return (
      <>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-2.5 mb-2.5">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              Store these somewhere safe. Each code can only be used once if you lose your authenticator.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {codes.map((code, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleCopyOne(code, idx)}
              className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group"
            >
              <span>{code}</span>
              {copiedIndex === idx ? (
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleCopyAll(codes)}
          className="mt-2 h-8 px-3 text-xs rounded-lg gap-1.5 w-full"
        >
          {copiedAll ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copiedAll ? "Copied!" : "Copy all backup codes"}
        </Button>
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="py-3.5">

      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
              isEnabled
                ? "bg-emerald-50 dark:bg-emerald-500/10"
                : "bg-zinc-100 dark:bg-zinc-800",
            )}
          >
            {isEnabled
              ? <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              : <Shield className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />}
          </div>
          <div>
            <p className="text-sm font-medium">Two-Factor Authentication</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEnabled
                ? "Your account is protected with TOTP authentication"
                : "Add an extra layer of security to your account"}
            </p>
          </div>
        </div>

        {/* Action buttons — only shown in idle state */}
        <div className="flex items-center gap-2 shrink-0">
          {step === "idle" && isEnabled && (
            <>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-medium">
                Enabled
              </span>
              <button
                type="button"
                onClick={() => { setCopiedAll(false); setStep("regen-confirm"); }}
                className={cn("text-xs font-medium transition-colors", accent.text)}
              >
                Backup codes
              </button>
              <button
                type="button"
                onClick={() => setStep("disable-confirm")}
                className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
              >
                Disable
              </button>
            </>
          )}
          {step === "idle" && !isEnabled && (
            <button
              type="button"
              onClick={() => setStep("enable-password")}
              className={cn("text-xs font-medium transition-colors", accent.text)}
            >
              Enable
            </button>
          )}
          {step !== "idle" && (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── Expandable panels ── */}
      <AnimatePresence mode="wait">

        {/* ── Step 1: Password entry for enable ── */}
        {step === "enable-password" && (
          <motion.div key="enable-password"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Compatible with Google Authenticator, Authy, 1Password, and all TOTP apps</span>
              </div>
              <PasswordInput onSubmit={handleEnable} />
              <Button
                onClick={handleEnable}
                disabled={isPending || !password}
                className={cn("h-9 px-4 text-sm rounded-xl gap-1.5", accent.btn)}
              >
                {isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ShieldCheck className="w-3.5 h-3.5" />}
                {isPending ? "Setting up…" : "Continue"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Scan QR + verify first code ── */}
        {step === "enable-qr" && (
          <motion.div key="enable-qr"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-4">

              {/* Sub-step 1: scan QR */}
              <div>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                  <StepBadge n={1} color="violet" />
                  Scan this QR code with your authenticator app
                </p>
                <div className="flex items-start gap-4">
                  {qrUrl && (
                    <div className="rounded-xl overflow-hidden bg-white p-1.5 shadow-sm border border-zinc-200 dark:border-zinc-700 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrUrl} alt="TOTP QR code" width={120} height={120} className="rounded-lg" />
                    </div>
                  )}
                  <div className="min-w-0 pt-1">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Open your authenticator app and scan this code to link your Duolync account.
                    </p>
                    <button
                      type="button"
                      onClick={() => setManualKeyOpen((v) => !v)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Can&apos;t scan? Enter the key manually
                      <ChevronDown className={cn("w-3 h-3 transition-transform", manualKeyOpen && "rotate-180")} />
                    </button>
                    <AnimatePresence>
                      {manualKeyOpen && totpUri && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 break-all overflow-hidden"
                        >
                          {new URL(totpUri).searchParams.get("secret") ?? totpUri}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Sub-step 2: verify first code → activates 2FA */}
              <div>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                  <StepBadge n={2} color="amber" />
                  Enter the 6-digit code from your app to activate
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <InputOTP
                    maxLength={6}
                    value={verifyCode}
                    onChange={setVerifyCode}
                    onComplete={handleVerifySetup}
                  >
                    <InputOTPGroup>
                      {[0, 1, 2].map((i) => <InputOTPSlot key={i} index={i} className="h-10 w-10" />)}
                    </InputOTPGroup>
                    <span className="text-muted-foreground text-sm">—</span>
                    <InputOTPGroup>
                      {[3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-10 w-10" />)}
                    </InputOTPGroup>
                  </InputOTP>
                  <Button
                    onClick={handleVerifySetup}
                    disabled={isPending || verifyCode.length !== 6}
                    className={cn("h-10 px-4 text-sm rounded-xl gap-1.5 shrink-0", accent.btn)}
                  >
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {isPending ? "Verifying…" : "Verify & Enable"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  The code changes every 30 seconds — enter the current one shown in your app.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Activated — show backup codes ── */}
        {step === "enable-done" && (
          <motion.div key="enable-done"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  2FA is now active on your account
                </p>
              </div>

              {backupCodes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                    <StepBadge n={3} color="amber" />
                    Save your backup codes
                  </p>
                  <BackupCodesGrid codes={backupCodes} />
                </div>
              )}

              <Button
                onClick={reset}
                className={cn("h-9 px-5 text-sm rounded-xl gap-1.5 mt-1", accent.btn)}
              >
                <Check className="w-3.5 h-3.5" />
                I&apos;ve saved my codes — Done
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Disable confirm ── */}
        {step === "disable-confirm" && (
          <motion.div key="disable-confirm"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldOff className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-200">
                    Disable two-factor authentication?
                  </p>
                  <p className="text-xs text-red-500/80 dark:text-red-400/70 mt-0.5">
                    Your account will be less secure. Enter your password to confirm.
                  </p>
                </div>
              </div>
              <PasswordInput onSubmit={handleDisable} />
              <Button
                onClick={handleDisable}
                disabled={isPending || !password}
                className="h-9 px-4 text-sm rounded-xl gap-1.5 bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                {isPending ? "Disabling…" : "Disable 2FA"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Regenerate — password entry ── */}
        {step === "regen-confirm" && (
          <motion.div key="regen-confirm"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Key className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Generate new backup codes</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All existing backup codes will be immediately invalidated.
                  </p>
                </div>
              </div>
              <PasswordInput onSubmit={handleRegenerate} />
              <Button
                onClick={handleRegenerate}
                disabled={isPending || !password}
                className={cn("h-9 px-4 text-sm rounded-xl gap-1.5", accent.btn)}
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {isPending ? "Generating…" : "Generate new codes"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Regenerate — show new codes ── */}
        {step === "regen-codes" && (
          <motion.div key="regen-codes"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">New backup codes</p>
              <BackupCodesGrid codes={backupCodes} />
              <Button
                onClick={reset}
                className={cn("h-9 px-5 text-sm rounded-xl gap-1.5 mt-1", accent.btn)}
              >
                <Check className="w-3.5 h-3.5" />
                I&apos;ve saved my codes — Done
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function StepBadge({ n, color }: { n: number; color: "violet" | "amber" }) {
  return (
    <span
      className={cn(
        "w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0",
        color === "amber"
          ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
          : "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400",
      )}
    >
      {n}
    </span>
  );
}

// ── Login OTP step ─────────────────────────────────────────────────────────────

interface TwoFactorOtpStepProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function TwoFactorOtpStep({ onBack, onSuccess }: TwoFactorOtpStepProps) {
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    if (code.length !== 6) return;
    startTransition(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        toast.error(error.message ?? "Invalid code — please try again");
        setCode("");
        return;
      }
      onSuccess();
    });
  }

  return (
    <motion.div
      key="2fa-otp"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="font-display text-2xl font-bold leading-tight">Two-factor check</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="space-y-5">
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={handleVerify}>
            <InputOTPGroup>
              {[0, 1, 2].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-base" />)}
            </InputOTPGroup>
            <span className="text-muted-foreground mx-1 text-lg">—</span>
            <InputOTPGroup>
              {[3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-base" />)}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          type="button"
          onClick={handleVerify}
          disabled={isPending || code.length !== 6}
          className="w-full h-11 btn-gradient font-semibold"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {isPending ? "Verifying…" : "Verify"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Lost your authenticator?{" "}
          <BackupCodeFallback />
        </p>

        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to login
        </button>
      </div>
    </motion.div>
  );
}

// ── Backup-code fallback (used inside login step) ──────────────────────────────

function BackupCodeFallback() {
  const [showInput, setShowInput] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleVerifyBackup() {
    if (!backupCode) return;
    startTransition(async () => {
      const { error } = await authClient.twoFactor.verifyBackupCode({ code: backupCode });
      if (error) {
        toast.error(error.message ?? "Invalid backup code");
        return;
      }
      toast.success("Backup code accepted");
    });
  }

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setShowInput(true)}
        className="text-primary font-semibold hover:underline"
      >
        Use a backup code
      </button>
    );
  }

  return (
    <span className="block mt-3 space-y-2">
      <Input
        value={backupCode}
        onChange={(e) => setBackupCode(e.target.value)}
        placeholder="Enter backup code"
        className="h-9 text-xs font-mono rounded-xl text-center"
        autoFocus
      />
      <Button
        type="button"
        size="sm"
        onClick={handleVerifyBackup}
        disabled={isPending || !backupCode}
        className="w-full h-8 text-xs btn-gradient rounded-xl"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify backup code"}
      </Button>
    </span>
  );
}
