"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  useSession,
  signIn as baSignIn,
  signOut as baSignOut,
  signUp as baSignUp,
} from "@/lib/auth-client";
import {
  getMyProfileAction,
  updateProfileAction,
  type FullProfile,
} from "@/app/actions/profile";

export type { FullProfile };

// ── Public profile type (snake_case to match existing callers) ─────────────
export interface Profile {
  id: string;
  user_id: string;
  user_type: "brand" | "creator" | "admin";
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  brand_account_type: "company" | "personal" | null;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  niche: string | null;
  primary_platform:
    | "youtube"
    | "tiktok"
    | "instagram"
    | "twitter"
    | "twitch"
    | "linkedin"
    | null;
  location: string | null;
  languages: string[];
  total_followers: number;
  avg_engagement_rate: number;
  /** Sourced from DB — reliable flag for onboarding gate checks. */
  hasCompletedOnboarding: boolean;
}

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  fullProfile: FullProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithProvider: (
    provider: "google" | "facebook",
    callbackURL?: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<Profile>,
  ) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Map FullProfile (DB) → Profile (public API) ────────────────────────────
function toProfile(fp: FullProfile): Profile {
  return {
    id: fp.id,
    user_id: fp.user_id,
    user_type: fp.user_type,
    email: fp.email,
    full_name: fp.full_name,
    avatar_url: fp.avatar_url,
    bio: fp.bio,
    brand_account_type: fp.brand_account_type,
    company_name: fp.company_name,
    industry: fp.industry,
    website: fp.website,
    niche: fp.niche,
    primary_platform: fp.primary_platform,
    location: fp.location,
    languages: fp.languages,
    total_followers: fp.total_followers,
    avg_engagement_rate: fp.avg_engagement_rate,
    hasCompletedOnboarding: fp.hasCompletedOnboarding,
  };
}

function userTypeFromRole(role: unknown): "brand" | "creator" | "admin" {
  const r = String(role ?? "").toLowerCase();
  if (r === "brand") return "brand";
  if (r === "admin") return "admin";
  return "creator";
}

/** Minimal profile from the Better Auth session so the app can render if the DB profile action 500s. */
function profileFromSession(sessionUser: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role?: unknown;
  hasCompletedOnboarding?: unknown;
}): Profile {
  return {
    id: sessionUser.id,
    user_id: sessionUser.id,
    user_type: userTypeFromRole(sessionUser.role),
    email: sessionUser.email,
    full_name: sessionUser.name ?? null,
    avatar_url: sessionUser.image ?? null,
    bio: null,
    brand_account_type: null,
    company_name: null,
    industry: null,
    website: null,
    niche: null,
    primary_platform: null,
    location: null,
    languages: ["English"],
    total_followers: 0,
    avg_engagement_rate: 0,
    hasCompletedOnboarding: Boolean(sessionUser.hasCompletedOnboarding),
  };
}

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, error: sessionError } = useSession();
  const [mounted, setMounted] = useState(false);
  const [dbProfile, setDbProfile] = useState<FullProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sessionUser = session?.user ?? null;

  useEffect(() => {
    if (sessionError) {
      console.warn("[useAuth] session fetch failed:", sessionError);
    }
  }, [sessionError]);

  const user: AuthUser | null = sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name ?? null,
        image: sessionUser.image ?? null,
      }
    : null;

  useEffect(() => {
    if (!sessionUser?.id) {
      setDbProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    getMyProfileAction()
      .then((p) => setDbProfile(p))
      .catch((err) => {
        console.warn("[useAuth] getMyProfileAction failed:", err);
        setDbProfile(null);
      })
      .finally(() => setProfileLoading(false));
  }, [sessionUser?.id]);

  const profile: Profile | null = dbProfile
    ? toProfile(dbProfile)
    : sessionUser
      ? profileFromSession(sessionUser)
      : null;

  // Wait for mount + session only. A failed/slow profile query must not block the UI —
  // we already have a session-derived fallback profile above.
  const loading = !mounted || (isPending && !sessionError);

  // ── Auth handlers ──────────────────────────────────────────────────────
  const handleSignUp = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error: Error | null }> => {
    const result = await baSignUp.email({
      email,
      password,
      name: fullName,
    } as Parameters<typeof baSignUp.email>[0]);
    return { error: result.error ? new Error(result.error.message) : null };
  };

  const handleSignIn = async (
    email: string,
    password: string,
  ): Promise<{ error: Error | null }> => {
    const result = await baSignIn.email({ email, password });
    return { error: result.error ? new Error(result.error.message) : null };
  };

  const handleSignInWithProvider = async (
    provider: "google" | "facebook",
    callbackURL?: string,
  ): Promise<{ error: Error | null }> => {
    const result = await baSignIn.social({
      provider,
      callbackURL:
        callbackURL ??
        (typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL) + "/onboarding",
    });
    return { error: result.error ? new Error(result.error.message) : null };
  };

  const handleSignOut = async () => {
    await baSignOut();
    setDbProfile(null);
  };

  // ── Profile mutations ─────────────────────────────────────────────────
  const refreshProfile = async () => {
    if (!sessionUser?.id) return;
    try {
      const fresh = await getMyProfileAction();
      setDbProfile(fresh);
    } catch (err) {
      console.warn("[useAuth] refreshProfile failed:", err);
    }
  };

  const updateProfile = async (
    updates: Partial<Profile>,
  ): Promise<{ error: Error | null }> => {
    const result = await updateProfileAction({
      bio: updates.bio,
      niche: updates.niche,
      primaryPlatform: updates.primary_platform,
      location: updates.location,
      companyName: updates.company_name,
      industry: updates.industry,
      website: updates.website,
      brandAccountType: updates.brand_account_type,
    });

    if (result.error) return { error: new Error(result.error) };
    await refreshProfile();
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        fullProfile: dbProfile,
        loading,
        signUp: handleSignUp,
        signIn: handleSignIn,
        signInWithProvider: handleSignInWithProvider,
        signOut: handleSignOut,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
