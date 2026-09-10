"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Creator } from "@/app/_components/discovery/ProfileDrawer";
import { useAuth } from "@/hooks/useAuth";
import {
  getCreatorsAction,
  getBrandsAction,
} from "@/app/actions/discover";

// ─── Brand profile type (shared with discover pages) ─────────────────────────

export interface BrandProfile {
  id: string;
  company_name: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  industry: string;
  website: string | null;
  brand_account_type: string | null;
  looking_for: string[];
}

// ─── Seed data — shown while the DB fetch is in-flight and as permanent
//     fallback so discover pages are never completely empty in dev. ───────────

export const SEED_CREATORS: Creator[] = [
  {
    id: "c1",
    full_name: "Sofia Reyes",
    avatar_url:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=faces&auto=format",
    bio: "Minimalist tech & lifestyle creator helping 180K followers live intentionally. Partnered with Apple, Notion, and Arc.",
    niche: "Tech, Lifestyle, Design",
    total_followers: 180_000,
    avg_engagement_rate: 4.8,
    primary_platform: "instagram",
    location: "Los Angeles, CA",
    languages: ["English", "Spanish"],
    verified: true,
    platforms: { instagram: "142K", tiktok: "38K" },
  },
  {
    id: "c2",
    full_name: "Marcus Chen",
    avatar_url:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=faces&auto=format",
    bio: "Full-time fitness creator on TikTok. 475K combined following building habits that stick. Partnered with Nike & Whoop.",
    niche: "Fitness, Health, Motivation",
    total_followers: 475_000,
    avg_engagement_rate: 6.2,
    primary_platform: "tiktok",
    location: "New York, NY",
    languages: ["English"],
    verified: true,
    platforms: { tiktok: "380K", instagram: "95K" },
  },
  {
    id: "c3",
    full_name: "Amara Osei",
    avatar_url:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop&crop=faces&auto=format",
    bio: "Inclusive beauty & fashion creator celebrating all skin tones. Based in London, campaigning globally.",
    niche: "Beauty, Fashion, Lifestyle",
    total_followers: 110_000,
    avg_engagement_rate: 5.5,
    primary_platform: "instagram",
    location: "London, UK",
    languages: ["English", "French"],
    platforms: { instagram: "92K", youtube: "18K" },
  },
  {
    id: "c4",
    full_name: "Jake Morrison",
    avatar_url:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=faces&auto=format",
    bio: "Weekly YouTube deep-dives on hardware, indie games & dev tools. Trusted by 257K tech enthusiasts.",
    niche: "Gaming, Tech Reviews",
    total_followers: 257_000,
    avg_engagement_rate: 3.9,
    primary_platform: "youtube",
    location: "Toronto, Canada",
    languages: ["English"],
    platforms: { youtube: "215K", twitter: "42K" },
  },
  {
    id: "c5",
    full_name: "Priya Mehta",
    avatar_url:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=120&h=120&fit=crop&crop=faces&auto=format",
    bio: "Food & travel creator documenting culinary adventures across Southeast Asia. Hyper-engaged micro audience.",
    niche: "Food, Travel, Culture",
    total_followers: 98_000,
    avg_engagement_rate: 7.1,
    primary_platform: "tiktok",
    location: "Singapore",
    languages: ["English", "Hindi"],
    platforms: { tiktok: "67K", instagram: "31K" },
  },
  {
    id: "c6",
    full_name: "Lena Kovács",
    avatar_url:
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=120&h=120&fit=crop&crop=faces&auto=format",
    bio: "Sustainable fashion advocate & creative director. Showing that style and sustainability can co-exist.",
    niche: "Fashion, Sustainability, Lifestyle",
    total_followers: 1_615_000,
    avg_engagement_rate: 2.8,
    primary_platform: "instagram",
    location: "Berlin, Germany",
    languages: ["English", "German"],
    verified: true,
    platforms: { instagram: "1.24M", tiktok: "280K", youtube: "95K" },
  },
];

export const SEED_BRANDS: BrandProfile[] = [
  {
    id: "b1",
    company_name: "NovaSkin",
    full_name: "NovaSkin Beauty",
    avatar_url: null,
    bio: "Science-backed skincare brand disrupting the $180B beauty industry with clean, effective formulations.",
    industry: "Beauty & Cosmetics",
    website: "novaskin.com",
    brand_account_type: "company",
    looking_for: ["Beauty", "Lifestyle", "Wellness"],
  },
  {
    id: "b2",
    company_name: "FlexCore",
    full_name: "FlexCore Fitness",
    avatar_url: null,
    bio: "Premium home gym equipment trusted by professional athletes. Running a year-long ambassador campaign.",
    industry: "Health & Fitness",
    website: "flexcore.io",
    brand_account_type: "company",
    looking_for: ["Fitness", "Health", "Motivation"],
  },
  {
    id: "b3",
    company_name: "Luminary",
    full_name: "Luminary Tech",
    avatar_url: null,
    bio: "Next-gen productivity SaaS built for creators and indie hackers. Looking for tech-forward voices.",
    industry: "Technology / SaaS",
    website: "luminary.app",
    brand_account_type: "company",
    looking_for: ["Tech", "Productivity", "Business"],
  },
  {
    id: "b4",
    company_name: "Terroir",
    full_name: "Terroir Foods",
    avatar_url: null,
    bio: "Artisan food brand sourcing directly from small farms across 12 countries. Zero compromise on flavour.",
    industry: "Food & Beverage",
    website: "terroir.co",
    brand_account_type: "company",
    looking_for: ["Food", "Travel", "Lifestyle"],
  },
  {
    id: "b5",
    company_name: "Arclight",
    full_name: "Arclight Wear",
    avatar_url: null,
    bio: "Sustainable activewear made from ocean-recovered plastic. Partnering with creators vocal about environmental impact.",
    industry: "Fashion & Apparel",
    website: "arclightwear.com",
    brand_account_type: "company",
    looking_for: ["Sustainability", "Fashion", "Fitness"],
  },
];

// ─── Context ──────────────────────────────────────────────────────────────────

interface ProfilesContextValue {
  creators: Creator[];
  brands: BrandProfile[];
  /** Optimistic local add — useful before the next DB re-fetch. */
  addCreator: (p: Creator) => void;
  addBrand: (p: BrandProfile) => void;
  /** Force a fresh DB fetch (e.g. right after onboarding completes). */
  refreshProfiles: () => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextValue>({
  creators: SEED_CREATORS,
  brands: SEED_BRANDS,
  addCreator: () => {},
  addBrand: () => {},
  refreshProfiles: async () => {},
});

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [creators, setCreators] = useState<Creator[]>(SEED_CREATORS);
  const [brands, setBrands] = useState<BrandProfile[]>(SEED_BRANDS);

  const fetchFromDB = async () => {
    try {
      const [dbCreators, dbBrands] = await Promise.all([
        getCreatorsAction(),
        getBrandsAction(),
      ]);

      // Real DB users take priority; seeds fill any gap (dev convenience).
      const dbCreatorIds = new Set(dbCreators.map((c) => c.id));
      const dbBrandIds = new Set(dbBrands.map((b) => b.id));

      setCreators([
        ...dbCreators,
        ...SEED_CREATORS.filter((c) => !dbCreatorIds.has(c.id)),
      ]);
      setBrands([
        ...dbBrands,
        ...SEED_BRANDS.filter((b) => !dbBrandIds.has(b.id)),
      ]);
    } catch {
      // Network error — seeds remain visible.
    }
  };

  // Hydrate from DB once signed in. The directory actions are session-gated, so
  // fetching while anonymous would only ever return empty.
  // Use user.id as the dependency (stable primitive) instead of the user object
  // reference so we only fetch once per session, not on every re-render.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    fetchFromDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addCreator = (p: Creator) => {
    setCreators((prev) => (prev.some((c) => c.id === p.id) ? prev : [p, ...prev]));
  };

  const addBrand = (p: BrandProfile) => {
    setBrands((prev) => (prev.some((b) => b.id === p.id) ? prev : [p, ...prev]));
  };

  return (
    <ProfilesContext.Provider
      value={{ creators, brands, addCreator, addBrand, refreshProfiles: fetchFromDB }}
    >
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles() {
  return useContext(ProfilesContext);
}
