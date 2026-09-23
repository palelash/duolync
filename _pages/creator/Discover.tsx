"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search, SlidersHorizontal, Heart, MessageSquare, X,
  MapPin, Users, TrendingUp, ChevronDown,
  Briefcase, Globe, Sparkles, UserPlus, UserCheck, Clock,
  // Filter category icons
  Cpu, Sun, Gamepad2, Flower2, Shirt, Dumbbell, UtensilsCrossed,
  Plane, Laugh, GraduationCap, Music2, Leaf, LayoutGrid,
  HeartPulse, ShoppingBag, DollarSign, Film,
} from "lucide-react";
import { VerifiedBadge } from "@/app/_components/shared/VerifiedBadge";
import { RichEmptyState } from "@/app/_components/shared/RichEmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MainLayout from "@/components/layout/MainLayout";
import ProfileDrawer, {
  type Creator, PlatformBadge, PLATFORM_META,
} from "@/components/discovery/ProfileDrawer";
import SaveCollectionModal, { type SaveTarget } from "@/components/favorites/SaveCollectionModal";
import { useProfiles, type BrandProfile } from "@/components/discovery/ProfilesContext";
import { useFavorites } from "@/components/favorites/FavoritesContext";
import { useMessaging } from "@/components/messaging/MessagingContext";
import { useAuth } from "@/hooks/useAuth";
import {
  sendConnectionRequestAction,
  withdrawConnectionAction,
  getConnectionStatusesAction,
  type ConnectionStatusResult,
  type ConnectionInfo,
} from "@/app/actions/connections";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SOCIAL_ICONS } from "@/app/_components/icons/SocialIcons";

type DiscoveryTab = "brands" | "creators";

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "twitch"];

const NICHES = [
  "All Niches", "Tech", "Lifestyle", "Gaming", "Beauty", "Fashion",
  "Fitness", "Food", "Travel", "Comedy", "Education", "Music", "Sustainability",
];

const INDUSTRIES = [
  "All Industries", "Beauty & Cosmetics", "Health & Fitness", "Technology / SaaS",
  "Food & Beverage", "Fashion & Apparel", "Travel", "Finance", "Education", "Entertainment",
];

const REACH_RANGES = [
  { value: "all",   label: "Any" },
  { value: "nano",  label: "<50K" },
  { value: "micro", label: "50K–200K" },
  { value: "mid",   label: "200K–1M" },
  { value: "mega",  label: "1M+" },
];

// ─── Filter icon maps ─────────────────────────────────────────────────────────

const NICHE_ICONS: Record<string, React.ElementType> = {
  "All Niches":     LayoutGrid,
  "Tech":           Cpu,
  "Lifestyle":      Sun,
  "Gaming":         Gamepad2,
  "Beauty":         Flower2,
  "Fashion":        Shirt,
  "Fitness":        Dumbbell,
  "Food":           UtensilsCrossed,
  "Travel":         Plane,
  "Comedy":         Laugh,
  "Education":      GraduationCap,
  "Music":          Music2,
  "Sustainability": Leaf,
};

const INDUSTRY_ICONS: Record<string, React.ElementType> = {
  "All Industries":        LayoutGrid,
  "Beauty & Cosmetics":    Flower2,
  "Health & Fitness":      HeartPulse,
  "Technology / SaaS":     Cpu,
  "Food & Beverage":       UtensilsCrossed,
  "Fashion & Apparel":     ShoppingBag,
  "Travel":                Plane,
  "Finance":               DollarSign,
  "Education":             GraduationCap,
  "Entertainment":         Film,
};

const PLATFORM_FILTER_ICONS: Record<string, React.ElementType> = {
  instagram:     SOCIAL_ICONS.instagram,
  tiktok:        SOCIAL_ICONS.tiktok,
  youtube:       SOCIAL_ICONS.youtube,
  twitter:       SOCIAL_ICONS.twitter,
  twitch:        SOCIAL_ICONS.twitch,
  facebook:      SOCIAL_ICONS.facebook,
  facebook_page: SOCIAL_ICONS.facebook_page,
  threads:       SOCIAL_ICONS.threads,
};

const BRAND_GRADIENTS = [
  "from-violet-600 to-indigo-600", "from-rose-500 to-pink-600",
  "from-violet-500 to-purple-600",  "from-amber-500 to-orange-600",
  "from-violet-600 to-pink-600",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function getNicheTags(niche: string | null): string[] {
  if (!niche) return [];
  return niche.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3);
}

function matchesReach(followers: number, range: string): boolean {
  if (range === "all")   return true;
  if (range === "nano")  return followers < 50_000;
  if (range === "micro") return followers >= 50_000 && followers < 200_000;
  if (range === "mid")   return followers >= 200_000 && followers < 1_000_000;
  if (range === "mega")  return followers >= 1_000_000;
  return true;
}

// Seed profiles have short IDs like "b1", "c3". Real cuid IDs are 25 chars.
function isRealProfile(id: string) {
  return id.length > 10;
}

// ─── Shared Connect Button ────────────────────────────────────────────────────

function ConnectBtn({
  targetId,
  connectionInfo,
  onConnectionChange,
}: {
  targetId: string;
  connectionInfo: ConnectionInfo;
  onConnectionChange: (id: string, status: ConnectionStatusResult, connId: string | null) => void;
}) {
  const { toast } = useToast();
  const [connStatus, setConnStatus] = useState<ConnectionStatusResult>(connectionInfo.status);
  const [connId, setConnId] = useState<string | null>(connectionInfo.connectionId);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setConnStatus(connectionInfo.status);
    setConnId(connectionInfo.connectionId);
  }, [connectionInfo.status, connectionInfo.connectionId]);

  const handle = async () => {
    if (connStatus === "accepted" || connStatus === "pending_received") return;
    setLoading(true);
    if (connStatus === "pending_sent" && connId) {
      const res = await withdrawConnectionAction(connId);
      if (!res.error) {
        setConnStatus("none"); setConnId(null);
        onConnectionChange(targetId, "none", null);
        toast({ title: "Request withdrawn" });
      }
    } else if (connStatus === "none") {
      const res = await sendConnectionRequestAction(targetId);
      if (!res.error && res.connectionId) {
        setConnStatus("pending_sent"); setConnId(res.connectionId);
        onConnectionChange(targetId, "pending_sent", res.connectionId);
        toast({ title: "Connection request sent!" });
      } else if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      }
    }
    setLoading(false);
  };

  const Icon = connStatus === "accepted" ? UserCheck : connStatus === "pending_sent" || connStatus === "pending_received" ? Clock : UserPlus;

  return (
    <Button
      variant="ghost" size="sm"
      disabled={loading || connStatus === "accepted" || connStatus === "pending_received"}
      title={connStatus === "accepted" ? "Connected" : connStatus === "pending_sent" ? "Withdraw request" : connStatus === "pending_received" ? "They sent you a request" : "Connect"}
      onClick={handle}
      className={cn(
        "h-8 w-8 p-0 rounded-xl border shrink-0 transition-colors",
        connStatus === "accepted"
          ? "border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10"
          : connStatus === "pending_sent" || connStatus === "pending_received"
          ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400"
          : "border-zinc-200 dark:border-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/40 hover:text-blue-600 dark:hover:text-blue-400",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </Button>
  );
}

// ─── Brand Card ───────────────────────────────────────────────────────────────

const BrandCard = ({
  brand,
  isSaved,
  onSave,
  onMessage,
  connectionInfo,
  onConnectionChange,
}: {
  brand: BrandProfile;
  isSaved: boolean;
  onSave: (t: SaveTarget) => void;
  onMessage: (b: BrandProfile) => void;
  connectionInfo: ConnectionInfo;
  onConnectionChange: (id: string, status: ConnectionStatusResult, connId: string | null) => void;
}) => {
  const initials = brand.company_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const gradient = BRAND_GRADIENTS[brand.id.charCodeAt(brand.id.length - 1) % BRAND_GRADIENTS.length];

  return (
    <div className="group relative flex flex-col bg-white dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_40px_rgba(0,0,0,0.45)] hover:-translate-y-0.5">
      <button
        onClick={() => onSave({ profileId: brand.id, profileType: "brand", snapshot: { displayName: brand.company_name, avatarUrl: brand.avatar_url, subtitle: brand.industry } })}
        aria-label={isSaved ? "Manage collections" : "Save brand"}
        className="absolute top-3.5 right-3.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm dark:shadow-none"
      >
        <Heart className={cn("w-3.5 h-3.5 transition-colors", isSaved ? "fill-rose-500 text-rose-500" : "text-zinc-400 dark:text-neutral-400 group-hover:text-zinc-600 dark:group-hover:text-neutral-300")} />
      </button>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start gap-3 mb-4 pr-8">
          <div className={cn("w-14 h-14 rounded-2xl shrink-0 overflow-hidden ring-2 ring-zinc-200/80 dark:ring-zinc-700/50", !brand.avatar_url && cn("bg-gradient-to-br flex items-center justify-center text-white font-display font-bold text-lg", gradient))}>
            {brand.avatar_url ? (
              <img
                src={brand.avatar_url}
                alt={brand.company_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // On load error, hide the img and show initials fallback
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    (e.target as HTMLImageElement).style.display = "none";
                    parent.classList.add(...("bg-gradient-to-br flex items-center justify-center text-white font-display font-bold text-lg " + gradient).split(" "));
                    parent.textContent = initials;
                  }
                }}
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[15px] truncate mb-0.5 text-zinc-900 dark:text-zinc-50">{brand.company_name}</div>
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20 font-medium">
              <Briefcase className="w-2.5 h-2.5" />{brand.industry}
            </span>
          </div>
        </div>
        {brand.bio && <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 mb-4 leading-relaxed">{brand.bio}</p>}
        {brand.looking_for.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2"><Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" /><span className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">Looking for</span></div>
            <div className="flex flex-wrap gap-1.5">
              {brand.looking_for.map((tag) => (
                <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 font-medium">{tag}</span>
              ))}
            </div>
          </div>
        )}
        {brand.website && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mt-auto mb-4"><Globe className="w-3 h-3 shrink-0" /><span className="truncate">{brand.website}</span></div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs btn-gradient rounded-xl font-semibold p-0" asChild>
            <Link href={`/profile/${brand.id}`}>View Brand</Link>
          </Button>
          {isRealProfile(brand.id) && <ConnectBtn targetId={brand.id} connectionInfo={connectionInfo} onConnectionChange={onConnectionChange} />}
          <Button
            variant="ghost" size="sm"
            className="h-8 w-8 p-0 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-200 dark:hover:border-purple-500/40 hover:text-purple-600 dark:hover:text-purple-400 shrink-0 transition-colors"
            aria-label="Message brand"
            onClick={() => onMessage(brand)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Creator Card ─────────────────────────────────────────────────────────────

const CreatorCard = ({
  creator, isSaved, onSave, onViewProfile, onMessage, connectionInfo, onConnectionChange,
}: {
  creator: Creator; isSaved: boolean;
  onSave: (t: SaveTarget) => void;
  onViewProfile: (c: Creator) => void;
  onMessage: (c: Creator) => void;
  connectionInfo: ConnectionInfo;
  onConnectionChange: (id: string, status: ConnectionStatusResult, connId: string | null) => void;
}) => {
  const tags = getNicheTags(creator.niche);
  const initials = creator.full_name ? creator.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "??";
  const platformEntries = Object.entries(creator.platforms ?? {}).slice(0, 3);

  return (
    <div className="group relative flex flex-col bg-white dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_40px_rgba(0,0,0,0.45)] hover:-translate-y-0.5">
      <button
        onClick={() => onSave({ profileId: creator.id, profileType: "creator", snapshot: { displayName: creator.full_name, avatarUrl: creator.avatar_url, subtitle: creator.niche, primaryPlatform: creator.primary_platform } })}
        aria-label={isSaved ? "Manage collections" : "Save creator"}
        className="absolute top-3.5 right-3.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm dark:shadow-none"
      >
        <Heart className={cn("w-3.5 h-3.5 transition-colors", isSaved ? "fill-rose-500 text-rose-500" : "text-zinc-400 dark:text-neutral-400 group-hover:text-zinc-600 dark:group-hover:text-neutral-300")} />
      </button>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start gap-3 mb-4 pr-8">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden ring-2 ring-zinc-200/80 dark:ring-zinc-700/50">
              {creator.avatar_url ? (
                <img src={creator.avatar_url} alt={creator.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-base font-bold text-zinc-400 dark:text-neutral-400">{initials}</div>
              )}
            </div>
            {creator.primary_platform && <div className="absolute -bottom-1 -right-1"><PlatformBadge platform={creator.primary_platform} /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-display font-bold text-[15px] truncate text-zinc-900 dark:text-zinc-50">{creator.full_name}</span>
              <VerifiedBadge show={creator.verified} />
            </div>
            {creator.location && <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{creator.location}</span></div>}
          </div>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((tag) => <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 font-medium">{tag}</span>)}
          </div>
        )}
        {platformEntries.length > 0 && (
          <div className="flex items-center gap-3 py-2.5 mb-3 border-y border-zinc-200/60 dark:border-zinc-800/60">
            {platformEntries.map(([p, count]) => {
              const url = creator.social_links?.[p];
              const badge = <div className="flex items-center gap-1.5"><PlatformBadge platform={p} /><span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{count}</span></div>;
              return url ? (
                <a key={p} href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" title={`Open ${PLATFORM_META[p]?.label ?? p} profile`} className="hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}>{badge}</a>
              ) : <div key={p}>{badge}</div>;
            })}
          </div>
        )}
        {creator.bio && <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4 leading-relaxed">{creator.bio}</p>}
        <div className="grid grid-cols-3 gap-0 border border-zinc-200/60 dark:border-zinc-800/80 rounded-xl overflow-hidden mb-4 mt-auto">
          <div className="flex flex-col items-center py-3 px-2">
            <div className="flex items-center gap-1 mb-0.5"><Users className="w-3 h-3 text-zinc-400 dark:text-muted-foreground" /><span className="text-sm font-display font-bold text-zinc-800 dark:text-zinc-200">{formatReach(creator.total_followers)}</span></div>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Reach</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2 border-x border-zinc-200/60 dark:border-zinc-800/80">
            <div className="flex items-center gap-1 mb-0.5"><TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /><span className="text-sm font-display font-bold text-emerald-600 dark:text-emerald-400">{creator.avg_engagement_rate}%</span></div>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Eng Rate</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2">
            <span className="text-sm font-display font-bold truncate w-full text-center text-zinc-800 dark:text-zinc-200">{creator.location?.split(",")[0] ?? "—"}</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Location</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs btn-gradient rounded-xl font-semibold" onClick={() => onViewProfile(creator)}>View Profile</Button>
          {isRealProfile(creator.id) && <ConnectBtn targetId={creator.id} connectionInfo={connectionInfo} onConnectionChange={onConnectionChange} />}
          <Button
            variant="ghost" size="sm"
            className="h-8 w-8 p-0 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-200 dark:hover:border-purple-500/40 hover:text-purple-600 dark:hover:text-purple-400 shrink-0 transition-colors"
            aria-label="Send message"
            onClick={() => onMessage(creator)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Skeleton Cards ───────────────────────────────────────────────────────────

const BrandSkeletonCard = () => (
  <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-5 animate-pulse shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-none">
    <div className="flex gap-3 mb-4 pr-8"><div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 shrink-0" /><div className="flex-1 space-y-2 pt-1"><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-3/4" /><div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded-full w-2/5" /></div></div>
    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-full mb-2" /><div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-4/5 mb-5" />
    <div className="flex gap-2 mb-4"><div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" /><div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-full" /></div>
    <div className="flex gap-2"><div className="flex-1 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl" /><div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl" /></div>
  </div>
);

const CreatorSkeletonCard = () => (
  <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-5 animate-pulse shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-none">
    <div className="flex gap-3 mb-4 pr-8"><div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 shrink-0" /><div className="flex-1 space-y-2 pt-1"><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-3/4" /><div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-1/2" /></div></div>
    <div className="flex gap-2 mb-3"><div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" /><div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-full" /></div>
    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-full mb-2" /><div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-4/5 mb-4" />
    <div className="flex gap-2"><div className="flex-1 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl" /><div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl" /></div>
  </div>
);

const EmptyState = ({ tab, isFiltered, onClear }: { tab: DiscoveryTab; isFiltered: boolean; onClear: () => void }) => {
  if (isFiltered) {
    return (
      <RichEmptyState
        className="col-span-full"
        icon={<Search className="w-8 h-8 text-violet-500" />}
        headline={`No ${tab === "brands" ? "brands" : "creators"} match these filters`}
        sub="Try broadening your search, removing a filter, or switching to a different niche or platform."
        secondary={{ label: "Clear all filters", onClick: onClear }}
        tips={[
          { icon: <Globe className="w-3 h-3" />, label: "Try a broader niche" },
          { icon: <Users className="w-3 h-3" />, label: "Remove platform filters" },
          { icon: <TrendingUp className="w-3 h-3" />, label: "Expand reach range" },
        ]}
        ambient="purple"
      />
    );
  }

  if (tab === "brands") {
    return (
      <RichEmptyState
        className="col-span-full"
        icon={<Briefcase className="w-8 h-8 text-violet-500" />}
        headline="No brands listed yet"
        sub="Brands are joining Duolync every day. Check back soon or update your profile so they can find you first."
        tips={[
          { icon: <Globe className="w-3 h-3" />, label: "Brands join daily" },
          { icon: <Sparkles className="w-3 h-3" />, label: "Complete your profile" },
          { icon: <Briefcase className="w-3 h-3" />, label: "Browse open campaigns" },
        ]}
        ambient="purple"
      />
    );
  }

  return (
    <RichEmptyState
      className="col-span-full"
      icon={<Users className="w-8 h-8 text-violet-500" />}
      headline="No creators listed yet"
      sub="The creator community is growing fast. Come back soon — or be one of the first to join and get discovered."
      tips={[
        { icon: <Users className="w-3 h-3" />, label: "Community growing daily" },
        { icon: <TrendingUp className="w-3 h-3" />, label: "Connect your platforms" },
        { icon: <MapPin className="w-3 h-3" />, label: "Set your niche & location" },
      ]}
      ambient="purple"
    />
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const CreatorDiscover = () => {
  const { profile } = useAuth();
  const { creators, brands } = useProfiles();
  const { isInAnyCollection } = useFavorites();
  const { openChatWindow } = useMessaging();

  const [loading] = useState(false);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("brands");
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);

  // ── Connection statuses ───────────────────────────────────────────────────
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionInfo>>({});

  // Fetch statuses once all profiles are loaded
  useEffect(() => {
    const allIds = [...creators.map((c) => c.id), ...brands.map((b) => b.id)];
    if (allIds.length === 0) return;
    getConnectionStatusesAction(allIds).then(setConnectionStatuses);
  }, [creators, brands]);

  const handleConnectionChange = useCallback(
    (targetId: string, status: ConnectionStatusResult, connId: string | null) => {
      setConnectionStatuses((prev) => ({ ...prev, [targetId]: { status, connectionId: connId } }));
    },
    [],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [industry, setIndustry] = useState("All Industries");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [niche, setNiche] = useState("All Niches");
  const [reachRange, setReachRange] = useState("all");

  const resetFilters = () => { setSearchQuery(""); setIndustry("All Industries"); setSelectedPlatforms([]); setNiche("All Niches"); setReachRange("all"); };
  const handleTabChange = (tab: DiscoveryTab) => { setActiveTab(tab); resetFilters(); };

  const handleMessageCreator = (creator: Creator) => {
    if (!profile) return;
    openChatWindow({ id: creator.id, full_name: creator.full_name, avatar_url: creator.avatar_url, user_type: "creator" });
  };

  const handleMessageBrand = (brand: BrandProfile) => {
    if (!profile) return;
    openChatWindow({ id: brand.id, full_name: brand.company_name, avatar_url: brand.avatar_url, user_type: "brand" });
  };

  const togglePlatform = (p: string) => setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const filteredBrands = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return brands.filter((b) => {
      if (q && !b.company_name.toLowerCase().includes(q) && !b.bio?.toLowerCase().includes(q)) return false;
      if (industry !== "All Industries" && b.industry !== industry) return false;
      return true;
    });
  }, [brands, searchQuery, industry]);

  const filteredCreators = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return creators.filter((c) => {
      if (q && !c.full_name?.toLowerCase().includes(q) && !c.niche?.toLowerCase().includes(q)) return false;
      if (selectedPlatforms.length > 0 && (!c.primary_platform || !selectedPlatforms.includes(c.primary_platform))) return false;
      if (niche !== "All Niches" && !c.niche?.toLowerCase().includes(niche.toLowerCase())) return false;
      if (!matchesReach(c.total_followers, reachRange)) return false;
      return true;
    });
  }, [creators, searchQuery, selectedPlatforms, niche, reachRange]);

  const filtered = activeTab === "brands" ? filteredBrands : filteredCreators;
  const activeFilterCount = activeTab === "brands" ? (industry !== "All Industries" ? 1 : 0) : selectedPlatforms.length + (niche !== "All Niches" ? 1 : 0) + (reachRange !== "all" ? 1 : 0);
  const isFiltered = !!searchQuery || activeFilterCount > 0;

  return (
    <MainLayout>
      <ProfileDrawer
        creator={selectedCreator}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onMessage={handleMessageCreator}
      />
      <SaveCollectionModal target={saveTarget} onClose={() => setSaveTarget(null)} />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-7">
          <h1 className="font-display text-3xl font-bold mb-1">Discover</h1>
          <p className="text-muted-foreground text-sm">Find brands to collaborate with or connect with fellow creators</p>
        </div>

        {/* Tab control */}
        <div className="inline-flex p-1 bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl gap-1 mb-6">
          {(["brands", "creators"] as DiscoveryTab[]).map((tab) => (
            <button key={tab} onClick={() => handleTabChange(tab)}
              className={cn("flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                activeTab === tab
                  ? "bg-primary text-white shadow-[0_2px_12px_rgba(139,92,246,0.35)]"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              {tab === "brands" ? <><Briefcase className="w-4 h-4" />Discover Brands</> : <><Users className="w-4 h-4" />Network with Creators</>}
            </button>
          ))}
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={activeTab === "brands" ? "Search by brand, industry…" : "Search by name, niche…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-primary/50"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 shrink-0 transition-colors cursor-pointer",
                  activeFilterCount > 0 && "border-violet-500/40 text-violet-400 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/[0.08]",
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[min(500px,calc(100vw-24px))] p-0 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 space-y-5">
                {activeTab === "brands" ? (
                  /* ── Brand filters: Industry ── */
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">Industry</p>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger className="h-9 border-white/10 bg-zinc-800/60 text-zinc-100 text-sm focus:ring-violet-500/40 focus:border-violet-500/40 cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl">
                        {INDUSTRIES.map((ind) => {
                          const IIcon = INDUSTRY_ICONS[ind];
                          return (
                            <SelectItem key={ind} value={ind} className="text-zinc-200 focus:bg-violet-500/15 focus:text-violet-200 cursor-pointer">
                              <span className="flex items-center gap-2">
                                {IIcon && <IIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                                {ind}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  /* ── Creator filters: Platform + Niche + Reach ── */
                  <>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">Platform</p>
                      <div className="flex flex-wrap gap-2">
                        {FILTER_PLATFORMS.map((p) => {
                          const active = selectedPlatforms.includes(p);
                          const PIcon = PLATFORM_FILTER_ICONS[p];
                          return (
                            <button
                              key={p}
                              onClick={() => togglePlatform(p)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer",
                                active
                                  ? "border-violet-500/40 bg-gradient-to-r from-violet-500/20 to-pink-500/10 text-violet-300"
                                  : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-zinc-200 hover:bg-white/[0.07]",
                              )}
                            >
                              {PIcon
                                ? <PIcon className="w-5 h-5 rounded-[4px] shrink-0" />
                                : <PlatformBadge platform={p} className="w-5 h-5" />
                              }
                              {PLATFORM_META[p]?.label ?? p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">Niche / Category</p>
                        <Select value={niche} onValueChange={setNiche}>
                          <SelectTrigger className="h-9 border-white/10 bg-zinc-800/60 text-zinc-100 text-sm focus:ring-violet-500/40 focus:border-violet-500/40 cursor-pointer">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl">
                            {NICHES.map((n) => {
                              const NIcon = NICHE_ICONS[n];
                              return (
                                <SelectItem key={n} value={n} className="text-zinc-200 focus:bg-violet-500/15 focus:text-violet-200 cursor-pointer">
                                  <span className="flex items-center gap-2">
                                    {NIcon && <NIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                                    {n}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">Audience Reach</p>
                        <div className="flex flex-wrap gap-2">
                          {REACH_RANGES.map((r) => (
                            <button
                              key={r.value}
                              onClick={() => setReachRange(r.value)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer",
                                reachRange === r.value
                                  ? "border-violet-500/40 bg-gradient-to-r from-violet-500/20 to-pink-500/10 text-violet-300"
                                  : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-zinc-200 hover:bg-white/[0.07]",
                              )}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Footer: count + clear */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.08]">
                  <span className="text-xs text-zinc-500">
                    {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                  </span>
                  {isFiltered && (
                    <button
                      onClick={resetFilters}
                      className="text-xs text-zinc-500 hover:text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />Clear all
                    </button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Count */}
        {!loading && (
          <div className="flex items-center justify-between mb-6 min-h-[28px]">
            <span className="text-xs text-muted-foreground">
              {filtered.length} {activeTab === "brands" ? "brand" : "creator"}{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Grid */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) =>
              activeTab === "brands" ? <BrandSkeletonCard key={i} /> : <CreatorSkeletonCard key={i} />
            )
          ) : filtered.length > 0 ? (
            activeTab === "brands" ? (
              (filteredBrands as BrandProfile[]).map((b) => (
                <BrandCard
                  key={b.id} brand={b} isSaved={isInAnyCollection(b.id)}
                  onSave={setSaveTarget} onMessage={handleMessageBrand}
                  connectionInfo={connectionStatuses[b.id] ?? { status: "none", connectionId: null }}
                  onConnectionChange={handleConnectionChange}
                />
              ))
            ) : (
              (filteredCreators as Creator[]).map((c) => (
                <CreatorCard
                  key={c.id} creator={c} isSaved={isInAnyCollection(c.id)}
                  onSave={setSaveTarget}
                  onViewProfile={(cr) => { setSelectedCreator(cr); setDrawerOpen(true); }}
                  onMessage={handleMessageCreator}
                  connectionInfo={connectionStatuses[c.id] ?? { status: "none", connectionId: null }}
                  onConnectionChange={handleConnectionChange}
                />
              ))
            )
          ) : (
            <EmptyState tab={activeTab} isFiltered={isFiltered} onClear={resetFilters} />
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default CreatorDiscover;
