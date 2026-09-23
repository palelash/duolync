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
    "The marketplace connecting brands with authentic content creators on YouTube, TikTok, and Instagram.";

  /* ── Inline SVG icons for the collage badges ── */
  const TikTokIcon = () => (
    <div className="w-5 h-5 bg-black rounded-full flex items-center justify-center shrink-0 ring-1 ring-white/20">
      <svg className="w-3 h-3 fill-white" viewBox="0 0 24 24" aria-hidden>
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.31 6.31 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.16 8.16 0 004.77 1.52V6.74a4.85 4.85 0 01-1-.05z" />
      </svg>
    </div>
  );
  const InstagramIcon = () => (
    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shrink-0 ring-1 ring-white/20">
      <svg className="w-3 h-3 fill-white" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    </div>
  );
  const YouTubeIcon = () => (
    <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center shrink-0 ring-1 ring-white/20">
      <svg className="w-3 h-3 fill-white" viewBox="0 0 24 24" aria-hidden>
        <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
      </svg>
    </div>
  );
  const CheckIcon = () => (
    <svg className="w-2.5 h-2.5 fill-white" viewBox="0 0 20 20" aria-hidden>
      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
    </svg>
  );

  return (
    <div className="min-h-screen gradient-hero flex relative overflow-hidden">
      {/* ── Full-page ambient orbs (form/right side) ──────────────── */}
      <div className="absolute -bottom-52 -left-52 w-[680px] h-[680px] rounded-full bg-violet-600/[0.15] blur-[130px] animate-auth-orb-1 pointer-events-none" />
      <div className="absolute -top-48 -right-48 w-[560px] h-[560px] rounded-full bg-cyan-500/[0.10] blur-[110px] animate-auth-orb-2 pointer-events-none" />
      <div className="absolute top-[40%] right-[15%] w-[360px] h-[360px] rounded-full bg-fuchsia-700/[0.07] blur-[90px] animate-auth-orb-3 pointer-events-none" />

      {/* ── Left panel – creator/brand collage ───────────────────── */}
      <div className="hidden lg:flex lg:w-[46%] gradient-primary p-10 xl:p-12 flex-col relative overflow-hidden">
        {/* Background shimmer blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-16 left-16 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-16 right-8 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute top-1/4 -right-20 w-80 h-80 bg-white/[0.04] rounded-full blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <a href="/" className="inline-flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-white font-bold text-xl leading-none">D</span>
            </div>
            <span className="font-display font-bold text-2xl text-white tracking-tight">Duolync</span>
          </a>
        </div>

        {/* ── Main content: headline + collage ── */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-6">

          {/* Headline */}
          <div className="mb-9">
            <h1 className="font-display text-4xl xl:text-5xl font-bold text-white leading-[1.15] whitespace-pre-line">
              {leftPanelHeadline}
            </h1>
            <p className="text-white/70 text-base xl:text-lg leading-relaxed max-w-[300px] mt-3">
              {leftPanelSub}
            </p>
          </div>

          {/* ── Creator-Brand Collage ── */}
          <div className="relative h-72">

            {/* ── Card 1 — TikTok Creator (left, tilted) ── */}
            <div className="absolute left-0 top-3 animate-float-card-1">
              <div className="w-[138px] rounded-2xl overflow-hidden border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)] relative">
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-2xl ring-1 ring-violet-400/30 pointer-events-none z-10" />
                <img
                  src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=240&h=290&fit=crop&q=80"
                  alt="TikTok content creator"
                  className="w-full h-48 object-cover"
                />
                {/* Glassmorphism footer */}
                <div className="bg-black/50 backdrop-blur-xl px-2.5 py-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5">
                    <TikTokIcon />
                    <div>
                      <p className="text-white text-[10px] font-bold leading-tight">2.4M</p>
                      <p className="text-white/50 text-[9px] leading-tight">followers</p>
                    </div>
                  </div>
                </div>
                {/* Verified badge */}
                <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/30 z-20">
                  <CheckIcon />
                </div>
              </div>
            </div>

            {/* ── Card 2 — Instagram Influencer (center, upright) ── */}
            <div className="absolute top-0 animate-float-card-2" style={{ left: "calc(50% - 65px)" }}>
              <div className="w-[130px] rounded-2xl overflow-hidden border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)] relative">
                <div className="absolute inset-0 rounded-2xl ring-1 ring-pink-400/30 pointer-events-none z-10" />
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=220&h=275&fit=crop&q=80"
                  alt="Instagram brand influencer"
                  className="w-full h-44 object-cover"
                />
                <div className="bg-black/50 backdrop-blur-xl px-2.5 py-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5">
                    <InstagramIcon />
                    <div>
                      <p className="text-white text-[10px] font-bold leading-tight">8.2%</p>
                      <p className="text-white/50 text-[9px] leading-tight">eng. rate</p>
                    </div>
                  </div>
                </div>
                {/* New Deal badge */}
                <div className="absolute top-2 left-2 bg-emerald-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg z-20 flex items-center gap-0.5">
                  <span>✓</span>
                  <span>New Deal</span>
                </div>
              </div>
            </div>

            {/* ── Card 3 — YouTube Creator (right, tilted other way) ── */}
            <div className="absolute right-0 top-6 animate-float-card-3">
              <div className="w-[134px] rounded-2xl overflow-hidden border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)] relative">
                <div className="absolute inset-0 rounded-2xl ring-1 ring-cyan-400/20 pointer-events-none z-10" />
                <img
                  src="https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=220&h=270&fit=crop&q=80"
                  alt="YouTube content creator"
                  className="w-full h-44 object-cover"
                />
                <div className="bg-black/50 backdrop-blur-xl px-2.5 py-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5">
                    <YouTubeIcon />
                    <div>
                      <p className="text-white text-[10px] font-bold leading-tight">892K</p>
                      <p className="text-white/50 text-[9px] leading-tight">subscribers</p>
                    </div>
                  </div>
                </div>
                {/* Verified badge */}
                <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/30 z-20">
                  <CheckIcon />
                </div>
              </div>
            </div>

            {/* ── Floating live-activity pill ── */}
            <div
              className="absolute -bottom-1 left-1/2 animate-float-pill bg-white/12 backdrop-blur-xl border border-white/20 rounded-full px-3.5 py-2 flex items-center gap-2 shadow-2xl z-30 whitespace-nowrap"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-white text-[11px] font-semibold tracking-wide">+1,240 deals closed this month</span>
            </div>

          </div>
        </div>

        {/* ── Bottom platform badges ── */}
        <div className="relative z-10 flex items-center gap-2.5">
          {[
            { icon: <YouTubeIcon />, label: "YouTube" },
            { icon: <TikTokIcon />, label: "TikTok" },
            { icon: <InstagramIcon />, label: "Instagram" },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-3 py-1.5"
            >
              {icon}
              <span className="text-white/80 text-xs font-medium">{label}</span>
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
