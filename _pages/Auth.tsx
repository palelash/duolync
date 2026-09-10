"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AuthHoldScreen } from "@/app/_components/auth/AuthHoldScreen";

type AuthTab = "signup" | "login";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const DuolyncLogo = ({ size = "md" }: { size?: "sm" | "md" }) => (
  <span
    className={cn(
      "font-display font-bold tracking-tight",
      size === "md" ? "text-2xl" : "text-xl",
    )}
    style={{
      background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    }}
  >
    Duolync
  </span>
);

const Auth = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialMode = searchParams?.get("mode");
  const initialEmail = searchParams?.get("email") ?? "";

  const [tab, setTab] = useState<AuthTab>(
    initialMode === "login" ? "login" : "signup",
  );
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { user, profile, loading, signUp, signIn, signInWithProvider } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    if (profile) {
      // Full profile loaded — redirect to the right destination.
      const target = profile.hasCompletedOnboarding
        ? profile.user_type === "brand"
          ? "/brand/dashboard"
          : "/creator/dashboard"
        : "/onboarding";
      router.refresh();
      router.replace(target);
    } else if (!loading) {
      // Profile failed to load (e.g. DB migration pending) but the user IS
      // authenticated. Fall back to /dashboard, which does its own server-side
      // role/onboarding check and redirects correctly.
      router.refresh();
      router.replace("/dashboard");
    }
  }, [user, profile, loading, router]);

  if (user) {
    return <AuthHoldScreen />;
  }

  const switchTab = (newTab: AuthTab) => {
    setTab(newTab);
    setEmail("");
    setPassword("");
    setFullName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (tab === "signup") {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        toast({
          title: "Account created!",
          description: "Welcome to Duolync!",
        });
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        toast({ title: "Welcome back!" });
      }
    } catch (err: unknown) {
      toast({
        title: "Authentication failed",
        description:
          err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialAuth = async (provider: "google" | "facebook") => {
    setIsLoading(true);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const callbackURL = `${origin}/onboarding`;
    const { error } = await signInWithProvider(provider, callbackURL);
    if (error) {
      toast({
        title: "OAuth error",
        description: error.message ?? `Unable to continue with ${provider}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const leftPanelHeadline = "Connect.\nCollaborate.\nGrow.";
  const leftPanelSub =
    "The leading marketplace connecting brands with authentic content creators.";

  return (
    <div className="min-h-screen gradient-hero flex relative overflow-hidden">
      {/* ── Full-page ambient orbs (form/right side) ──────────────── */}
      {/* Lower-left: warm purple/magenta */}
      <div className="absolute -bottom-52 -left-52 w-[680px] h-[680px] rounded-full bg-violet-600/[0.15] blur-[130px] animate-auth-orb-1 pointer-events-none" />
      {/* Upper-right: desaturated teal/cyan */}
      <div className="absolute -top-48 -right-48 w-[560px] h-[560px] rounded-full bg-cyan-500/[0.10] blur-[110px] animate-auth-orb-2 pointer-events-none" />
      {/* Centre-right: soft fuchsia accent */}
      <div className="absolute top-[40%] right-[15%] w-[360px] h-[360px] rounded-full bg-fuchsia-700/[0.07] blur-[90px] animate-auth-orb-3 pointer-events-none" />

      {/* ── Left panel – branding ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[46%] gradient-primary p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-16 left-16 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-16 right-8 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          {/* Extra shimmer on the left panel */}
          <div className="absolute top-1/4 -right-20 w-80 h-80 bg-white/[0.04] rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <a href="/" className="inline-flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-white font-bold text-xl leading-none">
                D
              </span>
            </div>
            <span className="font-display font-bold text-2xl text-white tracking-tight">
              Duolync
            </span>
          </a>
        </div>

        <div className="relative z-10 text-white">
          <h1 className="font-display text-4xl xl:text-5xl font-bold mb-6 leading-[1.15] whitespace-pre-line">
            {leftPanelHeadline}
          </h1>
          <p className="text-white/75 text-lg xl:text-xl leading-relaxed max-w-sm">
            {leftPanelSub}
          </p>
        </div>

        <div className="relative z-10 flex gap-10">
          {[
            ["50K+", "Creators"],
            ["10K+", "Brands"],
            ["1M+", "Collabs"],
          ].map(([num, label]) => (
            <div key={label}>
              <div className="text-3xl font-display font-bold text-white">
                {num}
              </div>
              <div className="text-white/55 text-sm mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel – form ────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <a href="/">
              <DuolyncLogo />
            </a>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl p-1 mb-7 backdrop-blur-sm">
            {(["signup", "login"] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold rounded-[9px] transition-all duration-200",
                  tab === t
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "signup" ? "Sign Up" : "Log In"}
              </button>
            ))}
          </div>

          {/* Form heading */}
          <div className="mb-5">
            <h2 className="font-display text-2xl font-bold leading-tight">
              {tab === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {tab === "login"
                ? "Log in to your Duolync account"
                : "Join Duolync to get started"}
            </p>
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-sm">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jane Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 h-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11"
                  required
                  minLength={6}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 btn-gradient font-semibold"
              disabled={isLoading}
            >
              {isLoading
                ? "Loading…"
                : tab === "signup"
                  ? "Create Account"
                  : "Log In"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-black/[0.10] to-black/[0.10] dark:via-white/[0.08] dark:to-white/[0.08]" />
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 px-2.5 py-1 rounded-full border border-black/[0.08] dark:border-white/[0.07] bg-black/[0.03] dark:bg-white/[0.03]">
              or
            </span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-black/[0.10] to-black/[0.10] dark:via-white/[0.08] dark:to-white/[0.08]" />
          </div>

          {/* Social buttons */}
          <div className="space-y-2.5">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-2.5 border-black/[0.12] hover:border-black/[0.22] bg-black/[0.03] hover:bg-black/[0.06] dark:border-white/[0.10] dark:hover:border-white/[0.20] dark:bg-white/[0.03] dark:hover:bg-white/[0.06] transition-all backdrop-blur-sm"
              onClick={() => handleSocialAuth("google")}
              disabled={isLoading}
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          </div>

          {/* Footer switch */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            {tab === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => switchTab("login")}
                  className="text-primary font-semibold hover:underline"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => switchTab("signup")}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
