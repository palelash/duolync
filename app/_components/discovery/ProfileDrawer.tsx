"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { useMessaging } from "@/components/messaging/MessagingContext";
import {
  X,
  Maximize2,
  Minimize2,
  MapPin,
  TrendingUp,
  Users,
  ChevronRight,
  Sparkles,
  MessageSquare,
  Send,
  DollarSign,
  Check,
  ArrowRight,
  Heart,
  MessageCircle,
  Eye,
  Grid3X3,
  Loader2,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getBrandCampaignsAction,
  type CampaignData,
} from "@/app/actions/campaigns";
import { sendBrandInvitationAction } from "@/app/actions/invitations";
import { useToast } from "@/hooks/use-toast";
import { VerifiedBadge } from "@/app/_components/shared/VerifiedBadge";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getCreatorPostsByUserIdAction,
  getAllCreatorPostsByUserIdAction,
  type SocialPostItem,
} from "@/app/actions/social-posts";
import {
  getCreatorAnalyticsAction,
  type CreatorAnalytics,
} from "@/app/actions/analytics";

// ─── Shared types (re-exported for discover pages) ───────────────────────────

export interface Creator {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  niche: string | null;
  total_followers: number;
  avg_engagement_rate: number;
  primary_platform: string | null;
  location: string | null;
  languages: string[];
  verified?: boolean;
  /** platform key → formatted follower count string (e.g. "12.3M") */
  platforms?: Record<string, string>;
  /** platform key (lowercase) → profile URL */
  social_links?: Record<string, string> | null;
}

type DrawerTab = "overview" | "analytics";

interface ProfileDrawerProps {
  creator: Creator | null;
  isOpen: boolean;
  onClose: () => void;
  /** When provided, clicking "Message" opens the full chat page instead of the quick-panel. */
  onMessage?: (creator: Creator) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PLATFORM_META: Record<
  string,
  { abbr: string; label: string; badgeClass: string; barColor: string }
> = {
  instagram: {
    abbr: "IG",
    label: "Instagram",
    badgeClass:
      "bg-gradient-to-br from-purple-600 via-rose-500 to-amber-400 text-white",
    barColor: "bg-gradient-to-r from-purple-500 to-rose-500",
  },
  tiktok: {
    abbr: "TT",
    label: "TikTok",
    badgeClass: "bg-neutral-950 border border-neutral-700 text-white",
    barColor: "bg-neutral-200",
  },
  youtube: {
    abbr: "YT",
    label: "YouTube",
    badgeClass: "bg-red-600 text-white",
    barColor: "bg-red-500",
  },
  twitter: {
    abbr: "𝕏",
    label: "X / Twitter",
    badgeClass: "bg-neutral-800 border border-neutral-700 text-white",
    barColor: "bg-sky-400",
  },
  twitch: {
    abbr: "TV",
    label: "Twitch",
    badgeClass: "bg-purple-700 text-white",
    barColor: "bg-purple-400",
  },
  linkedin: {
    abbr: "in",
    label: "LinkedIn",
    badgeClass: "bg-blue-700 text-white",
    barColor: "bg-blue-400",
  },
};

const MOCK_DEMOGRAPHICS = {
  topCountries: [
    { name: "United States", flag: "🇺🇸", pct: 45 },
    { name: "United Kingdom", flag: "🇬🇧", pct: 20 },
    { name: "Canada",         flag: "🇨🇦", pct: 12 },
    { name: "Australia",      flag: "🇦🇺", pct: 8  },
    { name: "Germany",        flag: "🇩🇪", pct: 6  },
  ],
  gender: { female: 62, male: 38 },
  ageGroups: [
    { range: "13–17", pct: 5  },
    { range: "18–24", pct: 42 },
    { range: "25–34", pct: 35 },
    { range: "35–44", pct: 12 },
    { range: "45+",   pct: 6  },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function getNicheTags(niche: string | null): string[] {
  if (!niche) return [];
  return niche.split(",").map((t) => t.trim()).filter(Boolean);
}

function parseFollowerStr(s: string): number {
  const t = s.trim().toUpperCase();
  if (t.endsWith("M")) return parseFloat(t) * 1_000_000;
  if (t.endsWith("K")) return parseFloat(t) * 1_000;
  return parseFloat(t) || 0;
}

function formatPeakHour(h: number): string {
  const fmt = (n: number) => {
    const ampm = n < 12 ? "AM" : "PM";
    const hour = n % 12 || 12;
    return `${hour} ${ampm}`;
  };
  return `${fmt(h)} – ${fmt((h + 3) % 24)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export const PlatformBadge = ({ platform }: { platform: string }) => {
  const meta = PLATFORM_META[platform] ?? {
    abbr: platform.slice(0, 2).toUpperCase(),
    badgeClass: "bg-neutral-700 text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold shrink-0",
        meta.badgeClass
      )}
    >
      {meta.abbr}
    </span>
  );
};

const AnalyticsBar = ({
  label,
  valueText,
  valuePct,
  barColor,
  sublabel,
}: {
  label: string;
  valueText: string;
  valuePct: number;
  barColor: string;
  sublabel?: string;
}) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-sm font-semibold truncate text-zinc-900 dark:text-zinc-50">{label}</span>
        {sublabel && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
            {sublabel}
          </span>
        )}
      </div>
      <span className="text-sm font-bold shrink-0 text-zinc-800 dark:text-zinc-200">{valueText}</span>
    </div>
    <div className="h-2.5 bg-zinc-200 dark:bg-neutral-800 rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700 ease-out",
          barColor
        )}
        style={{ width: `${Math.min(Math.max(valuePct, 2), 100)}%` }}
      />
    </div>
  </div>
);

/** Mini sparkline-style bar chart */
const EngagementTrend = ({ data }: { data: number[] }) => {
  const max = Math.max(...data);
  const avg = Math.round(data.reduce((a, b) => a + b, 0) / data.length);
  return (
    <div>
      <div className="flex items-end gap-[3px] h-16">
        {data.map((v, i) => {
          const isToday = i === data.length - 1;
          return (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-t-sm transition-all duration-700 ease-out cursor-default group relative",
                isToday ? "bg-primary" : "bg-primary/40 hover:bg-primary/70"
              )}
              style={{ height: `${Math.max((v / max) * 100, 4)}%` }}
              title={`${v}K views`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">14 days ago</span>
        <span className="text-[10px] font-medium text-zinc-500 dark:text-neutral-400">
          Avg: {avg}K views/day
        </span>
        <span className="text-[10px] text-muted-foreground">Today</span>
      </div>
    </div>
  );
};

// ─── Portfolio Thumbnail ──────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function PortfolioPostThumbnail({ post }: { post: SocialPostItem }) {
  const [imgErr, setImgErr] = useState(false);
  const emoji = post.platform === "instagram" ? "📷" : "📱";
  const isClickable = Boolean(post.postUrl);

  const inner = (
    <div className={cn("relative aspect-square rounded-xl overflow-hidden bg-zinc-100 dark:bg-neutral-800 group", isClickable ? "cursor-pointer" : "cursor-default")}>
      {post.imageUrl && !imgErr ? (
        <img
          src={post.imageUrl}
          alt={post.caption ?? "Post"}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl">{emoji}</div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200" />
      {/* Hover stats overlay */}
      <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2">
        {post.likes != null && (
          <span className="flex items-center gap-0.5 text-[10px] text-white font-medium">
            <Heart className="w-2.5 h-2.5" />{fmt(post.likes)}
          </span>
        )}
        {post.comments != null && (
          <span className="flex items-center gap-0.5 text-[10px] text-white font-medium">
            <MessageCircle className="w-2.5 h-2.5" />{fmt(post.comments)}
          </span>
        )}
        {post.views != null && (
          <span className="flex items-center gap-0.5 text-[10px] text-white font-medium">
            <Eye className="w-2.5 h-2.5" />{fmt(post.views)}
          </span>
        )}
      </div>
    </div>
  );

  if (post.postUrl) {
    return (
      <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

const ProfileDrawer = ({ creator, isOpen, onClose, onMessage }: ProfileDrawerProps) => {
  const { toast } = useToast();
  const { openChatWindow } = useMessaging();

  // Panel state
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");

  // Portfolio data
  const [previewPosts, setPreviewPosts] = useState<SocialPostItem[]>([]);
  const [allPosts, setAllPosts] = useState<SocialPostItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [showAllPosts, setShowAllPosts] = useState(false);

  // Invitation modal (replaces mock proposal)
  const [showProposal, setShowProposal] = useState(false);
  const [campaign, setCampaign] = useState("");
  const [budget, setBudget] = useState("");
  const [brief, setBrief] = useState("");
  const [brandCampaigns, setBrandCampaigns] = useState<CampaignData[]>([]);
  const [invitePending, startInviteTransition] = useTransition();

  // Analytics
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsKey, setAnalyticsKey] = useState(0);

  // Quick message panel
  const [showQuickMessage, setShowQuickMessage] = useState(false);
  const [messageText, setMessageText] = useState("");

  // ── Reset everything when drawer closes ───────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => {
        setIsFullScreen(false);
        setActiveTab("overview");
        setShowProposal(false);
        setShowQuickMessage(false);
        setShowAllPosts(false);
        setCampaign("");
        setBudget("");
        setBrief("");
        setBrandCampaigns([]);
        setMessageText("");
        setPreviewPosts([]);
        setAllPosts([]);
        setAnalytics(null);
        setAnalyticsLoading(false);
        setAnalyticsError(null);
        setAnalyticsKey(0);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Fetch creator posts when drawer opens ─────────────────────────────────
  useEffect(() => {
    if (!isOpen || !creator) return;
    let cancelled = false;
    setPortfolioLoading(true);
    getCreatorPostsByUserIdAction(creator.id, 6).then(({ data }) => {
      if (!cancelled) {
        setPreviewPosts(data);
        setPortfolioLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen, creator?.id]);

  // ── Fetch analytics when tab opens ───────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "analytics" || !creator) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    getCreatorAnalyticsAction(creator.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setAnalyticsError(error);
        setAnalytics(data);
        setAnalyticsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAnalyticsError("Could not load analytics. Please try again.");
        setAnalyticsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, creator?.id, analyticsKey]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showProposal) { setShowProposal(false); return; }
        if (showQuickMessage) { setShowQuickMessage(false); return; }
        onClose();
      }
    },
    [onClose, showProposal, showQuickMessage]
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── Fetch brand campaigns when proposal overlay opens ─────────────────────
  useEffect(() => {
    if (!showProposal) return;
    getBrandCampaignsAction().then(({ data }) => {
      const active = data.filter((c) => c.status === "ACTIVE");
      setBrandCampaigns(active);
      if (active.length === 1) setCampaign(active[0].id);
    });
  }, [showProposal]);

  // ── Action handlers ───────────────────────────────────────────────────────
  const handleSubmitProposal = () => {
    if (!creator || !campaign) {
      toast({ variant: "destructive", title: "Please select a campaign." });
      return;
    }
    startInviteTransition(async () => {
      const result = await sendBrandInvitationAction({
        creatorUserId: creator.id,
        campaignId: campaign,
        message: brief || undefined,
        proposedBudget: budget ? parseFloat(budget) : undefined,
      });
      if (result.error) {
        toast({ variant: "destructive", title: result.error });
        return;
      }
      toast({
        title: "Invitation sent! 🎉",
        description: `${creator.full_name} will be notified about your campaign.`,
      });
      setShowProposal(false);
      setCampaign("");
      setBudget("");
      setBrief("");
    });
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    toast({
      title: "Message sent!",
      description: `Your message was delivered to ${creator?.full_name}.`,
    });
    setMessageText("");
    setShowQuickMessage(false);
  };

  if (!creator) return null;

  const tags = getNicheTags(creator.niche);
  const initials = creator.full_name
    ? creator.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const platformEntries = Object.entries(creator.platforms ?? {});
  const maxPlatformFollowers = Math.max(
    1,
    ...platformEntries.map(([, v]) => parseFollowerStr(v))
  );

  // Shared width classes — kept in sync between panel + quick-message panel
  const drawerWidthCls = isFullScreen
    ? "w-full left-0 border-l-0"
    : "w-full md:w-[52vw] md:max-w-3xl";

  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────── */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/65 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen && !isFullScreen && !showProposal
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      />

      {/* ── Panel ──────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${creator.full_name} profile`}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col",
          "bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800",
          "shadow-[-32px_0_80px_rgba(0,0,0,0.08)] dark:shadow-[-32px_0_80px_rgba(0,0,0,0.75)]",
          "transition-all duration-320 ease-spring",
          isOpen ? "translate-x-0" : "translate-x-full",
          drawerWidthCls
        )}
      >
        {/* ── Top bar ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-100 dark:bg-neutral-800 shrink-0">
              {creator.avatar_url ? (
                <img src={creator.avatar_url} alt={creator.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full gradient-primary flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[13px] truncate leading-tight text-zinc-900 dark:text-zinc-50">
                  {creator.full_name}
                </span>
                <VerifiedBadge show={creator.verified} size="xs" />
              </div>
              {creator.location && (
                <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  {creator.location}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              onClick={() => setIsFullScreen((v) => !v)}
              title={isFullScreen ? "Minimize" : "Expand to full screen"}
              className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900/60 hover:bg-zinc-100 dark:hover:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600 flex items-center justify-center transition-colors text-zinc-700 dark:text-zinc-300"
            >
              {isFullScreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900/60 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-200 dark:hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center transition-colors text-zinc-700 dark:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────── */}
        <div className="flex items-end px-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          {(["overview", "analytics"] as DrawerTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-4 pt-3 pb-3 text-sm font-semibold capitalize transition-colors",
                activeTab === tab
                  ? "text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-500 dark:text-muted-foreground hover:text-zinc-700 dark:hover:text-neutral-300"
              )}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] gradient-primary rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* ── Scrollable content ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">

          {/* ── OVERVIEW TAB ─────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="p-6 space-y-7">
              {/* Hero */}
              <div className="flex items-start gap-5">
                <div className="relative shrink-0">
                  <div className="w-24 h-24 rounded-2xl bg-zinc-100 dark:bg-neutral-800 overflow-hidden ring-2 ring-zinc-200/80 dark:ring-neutral-700/50">
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt={creator.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full gradient-primary flex items-center justify-center text-white text-2xl font-bold">
                        {initials}
                      </div>
                    )}
                  </div>
                  {creator.verified && (
                    <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-neutral-800 flex items-center justify-center">
                      <VerifiedBadge show size="sm" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h2 className="font-display text-2xl font-bold leading-tight mb-1 text-zinc-900 dark:text-zinc-50">
                    {creator.full_name}
                  </h2>
                  {creator.location && (
                    <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 mb-2.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      {creator.location}
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-900/50">
                <div className="py-4 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-zinc-400 dark:text-muted-foreground" />
                    <span className="text-xl font-display font-bold text-zinc-800 dark:text-zinc-200">{formatReach(creator.total_followers)}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Total Reach</span>
                </div>
                <div className="py-4 flex flex-col items-center gap-1 border-x border-zinc-200/60 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xl font-display font-bold text-emerald-600 dark:text-emerald-400">{creator.avg_engagement_rate}%</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Eng Rate</span>
                </div>
                <div className="py-4 flex flex-col items-center gap-1">
                  <span className="text-xl font-display font-bold text-zinc-800 dark:text-zinc-200">{creator.languages?.[0] ?? "EN"}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Primary Lang</span>
                </div>
              </div>

              {/* Bio */}
              {creator.bio && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold mb-3">About</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{creator.bio}</p>
                </div>
              )}

              {/* Platform list */}
              {platformEntries.length > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold mb-3">Active Platforms</h3>
                  <div className="space-y-2">
                    {platformEntries.map(([platform, count]) => {
                      const meta = PLATFORM_META[platform];
                      const url = creator.social_links?.[platform];
                      const inner = (
                        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                          <div className="flex items-center gap-3">
                            <PlatformBadge platform={platform} />
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{meta?.label ?? platform}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{count}</span>
                            {url && <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />}
                          </div>
                        </div>
                      );
                      return url ? (
                        <a
                          key={platform}
                          href={url.startsWith("http") ? url : `https://${url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div key={platform}>{inner}</div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Content Portfolio */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">Content Portfolio</h3>
                  {previewPosts.length > 0 && (
                    <button
                      onClick={async () => {
                        if (allPosts.length === 0) {
                          const { data } = await getAllCreatorPostsByUserIdAction(creator.id);
                          setAllPosts(data);
                        }
                        setShowAllPosts(true);
                      }}
                      className="text-xs text-primary hover:text-primary/70 flex items-center gap-1 transition-colors"
                    >
                      View all <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {portfolioLoading ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-zinc-100 dark:bg-neutral-800 animate-pulse" />
                    ))}
                  </div>
                ) : previewPosts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600">
                    <Grid3X3 className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-xs">No posts synced yet</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {(["instagram", "tiktok"] as const).map((platform) => {
                      const posts = previewPosts.filter((p) => p.platform === platform);
                      if (posts.length === 0) return null;
                      const emoji = platform === "instagram" ? "📷" : "📱";
                      const label = platform === "instagram" ? "Instagram Posts" : "TikTok Posts";
                      return (
                        <div key={platform}>
                          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5">
                            <span>{emoji}</span>{label}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {posts.map((post) => (
                              <PortfolioPostThumbnail key={post.id} post={post} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ANALYTICS TAB ────────────────────────────────── */}
          {activeTab === "analytics" && (
            <div className="p-6 space-y-8">

              {/* Loading skeleton */}
              {analyticsLoading && (
                <div className="space-y-4">
                  {[140, 80, 80].map((h, i) => (
                    <div key={i} className="rounded-xl bg-zinc-100 dark:bg-neutral-800/60 animate-pulse" style={{ height: h }} />
                  ))}
                </div>
              )}

              {/* Error state */}
              {!analyticsLoading && analyticsError && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-red-400 opacity-60" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Analytics unavailable
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{analyticsError}</p>
                  </div>
                  <button
                    onClick={() => { setAnalytics(null); setAnalyticsError(null); setAnalyticsKey((k) => k + 1); }}
                    className="text-xs text-primary hover:text-primary/70 font-medium transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!analyticsLoading && (
                <>
                  {/* 1. Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Average Reach */}
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        <span className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">Avg Reach</span>
                      </div>
                      <span className="text-lg font-display font-bold text-zinc-900 dark:text-zinc-50 leading-none">
                        {analytics ? formatReach(analytics.avgReach) : formatReach(creator.total_followers)}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-500">per post</span>
                    </div>

                    {/* Best Platform */}
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3.5 flex flex-col gap-1.5 col-span-2">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">Best Platform</span>
                      </div>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
                        {analytics?.bestPlatform?.label ?? (creator.primary_platform ? `${creator.primary_platform.charAt(0).toUpperCase() + creator.primary_platform.slice(1)} — Active` : "N/A")}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-500">by engagement rate</span>
                    </div>

                    {/* Peak Activity */}
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3.5 flex flex-col gap-1.5 col-span-3">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">Audience Activity Peak</span>
                      </div>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {analytics?.peakHour != null
                          ? formatPeakHour(analytics.peakHour)
                          : "6 PM – 9 PM"}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-500">highest engagement window</span>
                    </div>
                  </div>

                  {/* 2. Engagement Rate — 3-Month Line Chart */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">
                        Engagement Rate Trend
                      </h3>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Last 3 months</span>
                    </div>
                    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart
                          data={
                            analytics?.engagementTrend && analytics.engagementTrend.some((p) => p.rate > 0)
                              ? analytics.engagementTrend
                              : [
                                  { month: "Apr", rate: creator.avg_engagement_rate * 0.85 },
                                  { month: "May", rate: creator.avg_engagement_rate * 0.92 },
                                  { month: "Jun", rate: creator.avg_engagement_rate },
                                ]
                          }
                          margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="lineGradientStroke" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#a78bfa" />
                              <stop offset="100%" stopColor="#c4b5fd" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 10, fill: "#71717a" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: "#71717a" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#09090b",
                              border: "1px solid #3f3f46",
                              borderRadius: 8,
                              fontSize: 11,
                              color: "#e4e4e7",
                            }}
                            formatter={(v: number) => [`${v.toFixed(2)}%`, "Eng Rate"]}
                            labelStyle={{ color: "#a1a1aa" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="rate"
                            stroke="url(#lineGradientStroke)"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: "#c4b5fd", strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 3. Platform Reach Breakdown */}
                  {platformEntries.length > 0 && (
                    <div>
                      <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold mb-4">
                        Platform Reach Breakdown
                      </h3>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
                        <ResponsiveContainer width="100%" height={110}>
                          <BarChart
                            data={platformEntries.map(([platform, countStr]) => ({
                              name: PLATFORM_META[platform]?.abbr ?? platform.slice(0, 2).toUpperCase(),
                              followers: parseFollowerStr(countStr),
                            }))}
                            margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#a78bfa" />
                                <stop offset="100%" stopColor="#7c3aed" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
                            <YAxis
                              tick={{ fontSize: 9, fill: "#71717a" }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v: number) =>
                                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
                              }
                            />
                            <Tooltip
                              contentStyle={{ background: "#09090b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, color: "#e4e4e7" }}
                              formatter={(v: number) => [
                                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v),
                                "Followers",
                              ]}
                            />
                            <Bar dataKey="followers" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* 4. Performance Scores */}
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold mb-5">
                      Performance Scores
                    </h3>
                    <div className="space-y-5">
                      <AnalyticsBar
                        label="Engagement Rate"
                        valueText={`${analytics?.avgEngagementRate ?? creator.avg_engagement_rate}%`}
                        valuePct={((analytics?.avgEngagementRate ?? creator.avg_engagement_rate) / 10) * 100}
                        barColor="bg-emerald-500"
                        sublabel={(analytics?.avgEngagementRate ?? creator.avg_engagement_rate) >= 5 ? "Above average ✦" : "Industry avg"}
                      />
                      <AnalyticsBar
                        label="Audience Authenticity"
                        valueText="94%"
                        valuePct={94}
                        barColor="bg-gradient-to-r from-violet-500 to-indigo-500"
                        sublabel="High quality"
                      />
                      <AnalyticsBar
                        label="Brand Alignment Score"
                        valueText={`${Math.min(99, Math.round((analytics?.avgEngagementRate ?? creator.avg_engagement_rate) * 12))}%`}
                        valuePct={Math.min(99, (analytics?.avgEngagementRate ?? creator.avg_engagement_rate) * 12)}
                        barColor="bg-gradient-to-r from-amber-400 to-orange-400"
                      />
                    </div>
                  </div>

                  {/* 5. Audience Demographics */}
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold mb-5">
                      Audience Demographics
                    </h3>

                    <div className="space-y-3 mb-6">
                      <p className="text-xs font-medium text-zinc-500 dark:text-neutral-400">Top Countries</p>
                      {MOCK_DEMOGRAPHICS.topCountries.map((c) => (
                        <div key={c.name} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-50">
                              <span>{c.flag}</span>
                              {c.name}
                            </span>
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{c.pct}%</span>
                          </div>
                          <div className="h-2 bg-zinc-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-600 rounded-full transition-all duration-700 ease-out" style={{ width: `${c.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 mb-6">
                      <p className="text-xs font-medium text-zinc-500 dark:text-neutral-400">Gender Split</p>
                      <div className="h-3.5 rounded-full overflow-hidden flex">
                        <div className="h-full bg-rose-400 transition-all duration-700 ease-out" style={{ width: `${MOCK_DEMOGRAPHICS.gender.female}%` }} />
                        <div className="h-full bg-sky-400 flex-1" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
                          <span className="text-zinc-500 dark:text-muted-foreground">Female</span>
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{MOCK_DEMOGRAPHICS.gender.female}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{MOCK_DEMOGRAPHICS.gender.male}%</span>
                          <span className="text-zinc-500 dark:text-muted-foreground">Male</span>
                          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-zinc-500 dark:text-neutral-400 mb-3">Age Groups</p>
                      {MOCK_DEMOGRAPHICS.ageGroups.map((ag) => (
                        <div key={ag.range} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500 dark:text-muted-foreground w-11 shrink-0 font-medium">{ag.range}</span>
                          <div className="flex-1 h-2 bg-zinc-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-primary/70 rounded-full transition-all duration-700 ease-out" style={{ width: `${ag.pct}%` }} />
                          </div>
                          <span className="text-xs font-bold w-7 text-right shrink-0 text-zinc-800 dark:text-zinc-200">{ag.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 6. Availability callout */}
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/[0.07] border border-primary/20">
                    <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold mb-0.5 text-zinc-900 dark:text-zinc-50">Open for partnerships</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Avg. response time: 4 hours. Active campaign slots available for sponsored content.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer CTA ───────────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex gap-3">
          <Button
            className="flex-1 h-10 btn-gradient rounded-xl font-semibold gap-2"
            onClick={() => setShowProposal(true)}
          >
            <Send className="w-3.5 h-3.5" />
            Send Proposal
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-10 rounded-xl border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-500 font-semibold gap-2 transition-colors text-zinc-900 dark:text-zinc-50"
            onClick={() => {
              if (!creator) return;
              // Always prefer the floating chat window; close the drawer first.
              onClose();
              if (onMessage) {
                onMessage(creator);
              } else {
                openChatWindow({
                  id: creator.id,
                  full_name: creator.full_name,
                  avatar_url: creator.avatar_url,
                  user_type: "creator",
                });
              }
            }}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Message
          </Button>
        </div>
      </div>

      {/* ── Quick Message Panel (slides up, matches drawer width) ──────── */}
      <div
        className={cn(
          "fixed bottom-0 right-0 z-[55]",
          "bg-[#09090e] border-t border-l border-neutral-800/60",
          "shadow-[0_-16px_48px_rgba(0,0,0,0.65)]",
          "transition-all duration-300 ease-spring",
          drawerWidthCls,
          isOpen && showQuickMessage ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="p-4 pb-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                {creator.avatar_url ? (
                  <img src={creator.avatar_url} alt={creator.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center text-white text-[10px] font-bold">
                    {initials}
                  </div>
                )}
              </div>
              <div className="leading-tight">
                <span className="text-sm font-semibold">Quick Message</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowRight className="w-2.5 h-2.5" />
                  {creator.full_name}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowQuickMessage(false)}
              className="w-7 h-7 rounded-lg border border-neutral-800 hover:bg-neutral-800 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <Textarea
              placeholder={`Write a message to ${creator.full_name}…`}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendMessage();
              }}
              className="flex-1 resize-none h-[72px] border-neutral-800 bg-neutral-950/60 text-sm placeholder:text-neutral-600 focus:border-primary/50"
            />
            <Button
              className="h-10 px-4 btn-gradient rounded-xl font-semibold gap-1.5 shrink-0 self-end"
              onClick={handleSendMessage}
              disabled={!messageText.trim()}
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            ⌘ Enter to send instantly
          </p>
        </div>
      </div>

      {/* ── View All Portfolio Modal ──────────────────────────────── */}
      {showAllPosts && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-16 overflow-y-auto">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowAllPosts(false)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden mb-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Full Portfolio</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{creator.full_name} · {allPosts.length} posts</p>
              </div>
              <button
                onClick={() => setShowAllPosts(false)}
                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 space-y-6">
              {(["instagram", "tiktok"] as const).map((platform) => {
                const posts = allPosts.filter((p) => p.platform === platform);
                if (posts.length === 0) return null;
                const emoji = platform === "instagram" ? "📷" : "📱";
                const label = platform === "instagram" ? "Instagram Posts" : "TikTok Posts";
                return (
                  <div key={platform}>
                    <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-1.5">
                      <span>{emoji}</span>{label}
                      <span className="ml-1 text-zinc-400 dark:text-zinc-600">({posts.length})</span>
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {posts.map((post) => (
                        <PortfolioPostThumbnail key={post.id} post={post} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {allPosts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                  <Grid3X3 className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No posts available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Proposal Modal ────────────────────────────────────────── */}
      {showProposal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Modal backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowProposal(false)}
          />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.85)] overflow-hidden">

            {/* Top accent bar */}
            <div className="h-0.5 w-full gradient-primary" />

            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-neutral-800">
              <div>
                <h2 className="font-display text-[17px] font-bold leading-tight">
                  Invite to Campaign
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  to{" "}
                  <span className="text-foreground font-semibold">
                    {creator.full_name}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowProposal(false)}
                className="w-8 h-8 rounded-lg border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Form body */}
            <div className="px-6 py-5 space-y-5">

              {/* Campaign */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Active Campaign
                </label>
                {brandCampaigns.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-neutral-700 p-3 text-sm text-muted-foreground text-center">
                    No active campaigns found.{" "}
                    <a href="/brand/campaigns" className="text-primary hover:underline">
                      Create one first →
                    </a>
                  </div>
                ) : (
                  <Select value={campaign} onValueChange={setCampaign}>
                    <SelectTrigger className="border-neutral-800 bg-neutral-950/50 h-10 text-sm focus:ring-primary/40">
                      <SelectValue placeholder="Choose a campaign…" />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-neutral-800">
                      {brandCampaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="focus:bg-neutral-800">
                          <div className="flex items-center gap-2">
                            <Megaphone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{c.title}</span>
                            <span className="text-xs text-muted-foreground ml-1">${c.budget.toLocaleString()}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Budget */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Offer Budget (USD)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    placeholder="e.g. 1500"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="pl-9 h-10 border-neutral-800 bg-neutral-950/50 text-sm focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Brief */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Message / Brief Guidelines
                </label>
                <Textarea
                  placeholder="Describe campaign goals, deliverables, timeline, and any creative direction…"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="resize-none h-28 border-neutral-800 bg-neutral-950/50 text-sm placeholder:text-neutral-600 focus:border-primary/50"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 pb-5 pt-1">
              <Button
                className="flex-1 h-10 btn-gradient rounded-xl font-semibold gap-2"
                onClick={handleSubmitProposal}
                disabled={invitePending || !campaign}
              >
                {invitePending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Invitation
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-xl border-neutral-700 hover:border-neutral-500 font-semibold"
                onClick={() => setShowProposal(false)}
                disabled={invitePending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProfileDrawer;
