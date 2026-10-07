"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Star, StarOff, EyeOff, Eye, ChevronUp, ChevronDown,
  Library, Loader2, Instagram, Youtube,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getCreatorContentAction,
  setContentFeaturedAction,
  setContentHiddenAction,
  reorderFeaturedContentAction,
  type ContentLibraryItem,
  type FeaturedCount,
} from "@/app/actions/content-curation";
import { SOCIAL_ICONS } from "@/app/_components/icons/SocialIcons";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_TABS = ["All", "Instagram", "TikTok", "YouTube"] as const;
type PlatformTab = (typeof PLATFORM_TABS)[number];

const TAB_PLATFORM_KEY: Record<string, string> = {
  Instagram: "instagram",
  TikTok: "tiktok",
  YouTube: "youtube",
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: "📸",
  tiktok: "📱",
  youtube: "▶️",
};

const SOURCE_LABELS: Record<string, string> = {
  OFFICIAL_API: "Official",
  APIFY: "Public data",
  RAPIDAPI: "Public data",
  MANUAL_IMPORT: "Imported",
  LEGACY_UNKNOWN: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Featured counter badge ─────────────────────────────────────────────────────

function FeaturedCountBadge({ featuredCount }: { featuredCount: FeaturedCount }) {
  const { current, max } = featuredCount;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
        current === 0
          ? "bg-zinc-800/60 text-zinc-400 border-zinc-700"
          : current === max
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-violet-500/10 text-violet-300 border-violet-500/25",
      )}
    >
      <Star className="w-3 h-3" />
      Featured {current} / {max}
    </span>
  );
}

// ── Content card ───────────────────────────────────────────────────────────────

interface ContentCardProps {
  item: ContentLibraryItem;
  featuredCount: FeaturedCount;
  featuredItems: ContentLibraryItem[];
  onOptimistic: (updated: ContentLibraryItem) => void;
  onReorder: (ordered: ContentLibraryItem[]) => void;
}

function ContentCard({
  item,
  featuredCount,
  featuredItems,
  onOptimistic,
  onReorder,
}: ContentCardProps) {
  const { toast } = useToast();
  const [imgError, setImgError] = useState(false);
  const [pending, startTransition] = useTransition();

  const PlatformIcon = SOCIAL_ICONS[item.platform];
  const sourceLabel = SOURCE_LABELS[item.dataSource] ?? "";
  const emoji = PLATFORM_EMOJI[item.platform] ?? "📱";

  const myFeaturedIndex = featuredItems.findIndex(
    (f) => f.platform === item.platform && f.providerPostId === item.providerPostId,
  );
  const isFirst = myFeaturedIndex === 0;
  const isLast = myFeaturedIndex === featuredItems.length - 1;

  const handleFeature = (featured: boolean) => {
    if (!item.providerPostId) return;
    if (featured && featuredCount.current >= featuredCount.max) {
      toast({
        title: "Feature up to 6 items.",
        description: "Unfeature an item first to add another.",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      // Optimistic update
      onOptimistic({
        ...item,
        isFeatured: featured,
        isHidden: featured ? false : item.isHidden,
        featuredOrder: featured ? featuredCount.current : null,
      });

      const result = await setContentFeaturedAction({
        platform: item.platform,
        providerPostId: item.providerPostId!,
        featured,
      });

      if (!result.ok) {
        // Revert
        onOptimistic(item);
        if (result.code === "featured_limit") {
          toast({ title: "Feature up to 6 items.", variant: "destructive" });
        } else {
          toast({ title: result.error, variant: "destructive" });
        }
      }
    });
  };

  const handleHide = (hidden: boolean) => {
    if (!item.providerPostId) return;
    startTransition(async () => {
      onOptimistic({
        ...item,
        isHidden: hidden,
        isFeatured: hidden ? false : item.isFeatured,
        featuredOrder: hidden ? null : item.featuredOrder,
      });

      const result = await setContentHiddenAction({
        platform: item.platform,
        providerPostId: item.providerPostId!,
        hidden,
      });

      if (!result.ok) {
        onOptimistic(item);
        toast({ title: result.error, variant: "destructive" });
      }
    });
  };

  const handleMoveUp = () => {
    if (myFeaturedIndex <= 0) return;
    const newOrder = [...featuredItems];
    [newOrder[myFeaturedIndex - 1], newOrder[myFeaturedIndex]] = [
      newOrder[myFeaturedIndex],
      newOrder[myFeaturedIndex - 1],
    ];
    startTransition(async () => {
      onReorder(newOrder);
      const result = await reorderFeaturedContentAction({
        ordered: newOrder.map((f) => ({
          platform: f.platform,
          providerPostId: f.providerPostId!,
        })),
      });
      if (!result.ok) {
        onReorder(featuredItems);
        toast({ title: result.error, variant: "destructive" });
      }
    });
  };

  const handleMoveDown = () => {
    if (myFeaturedIndex === -1 || myFeaturedIndex >= featuredItems.length - 1) return;
    const newOrder = [...featuredItems];
    [newOrder[myFeaturedIndex], newOrder[myFeaturedIndex + 1]] = [
      newOrder[myFeaturedIndex + 1],
      newOrder[myFeaturedIndex],
    ];
    startTransition(async () => {
      onReorder(newOrder);
      const result = await reorderFeaturedContentAction({
        ordered: newOrder.map((f) => ({
          platform: f.platform,
          providerPostId: f.providerPostId!,
        })),
      });
      if (!result.ok) {
        onReorder(featuredItems);
        toast({ title: result.error, variant: "destructive" });
      }
    });
  };

  return (
    <div
      className={cn(
        "relative flex gap-4 p-4 rounded-xl border transition-colors",
        item.isFeatured
          ? "border-violet-500/30 bg-violet-500/5"
          : item.isHidden
          ? "border-zinc-700/40 bg-zinc-900/30 opacity-60"
          : "border-zinc-800/60 bg-zinc-900/40",
      )}
    >
      {/* Loading overlay */}
      {pending && (
        <div className="absolute inset-0 rounded-xl bg-zinc-900/50 flex items-center justify-center z-10">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
        </div>
      )}

      {/* Thumbnail */}
      <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg overflow-hidden bg-zinc-800 relative">
        {item.imageUrl && !imgError ? (
          <img
            src={item.imageUrl}
            alt={item.caption ?? "Post"}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            {PlatformIcon ? (
              <PlatformIcon className="w-8 h-8 rounded-md" />
            ) : (
              <span>{emoji}</span>
            )}
          </div>
        )}
        {/* Featured badge overlay */}
        {item.isFeatured && (
          <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
            <Star className="w-3 h-3 text-white fill-white" />
          </div>
        )}
        {item.isHidden && (
          <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
            <EyeOff className="w-3 h-3 text-zinc-300" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Platform + source */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300 capitalize">
            {emoji} {item.platform}
          </span>
          {sourceLabel && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 border-zinc-700 text-zinc-500">
              {sourceLabel}
            </Badge>
          )}
          {item.isFeatured && (
            <Badge className="text-[10px] py-0 h-4 bg-violet-500/20 text-violet-300 border border-violet-500/30">
              Featured #{(item.featuredOrder ?? 0) + 1}
            </Badge>
          )}
          {item.isHidden && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 border-zinc-600 text-zinc-500">
              Hidden
            </Badge>
          )}
        </div>

        {/* Caption */}
        {item.caption && (
          <p className="text-sm text-zinc-300 line-clamp-2 mb-1">{item.caption}</p>
        )}

        {/* Date + metrics */}
        <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
          <span>{fmtDate(item.postedAt)}</span>
          {item.views != null && <span>👁 {fmt(item.views)}</span>}
          {item.likes != null && <span>❤️ {fmt(item.likes)}</span>}
          {item.comments != null && <span>💬 {fmt(item.comments)}</span>}
        </div>

        {/* No providerPostId helper */}
        {!item.isCuratable && (
          <p className="text-[11px] text-zinc-600 mt-2 italic">
            Connect the official account to feature or hide this.
          </p>
        )}
      </div>

      {/* Controls */}
      {item.isCuratable && (
        <div className="flex flex-col gap-1.5 shrink-0 self-start">
          {/* Feature / Unfeature */}
          {item.isFeatured ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs gap-1 border-violet-500/40 text-violet-300 hover:bg-violet-500/10"
              onClick={() => handleFeature(false)}
              disabled={pending}
              title="Remove from Featured"
            >
              <StarOff className="w-3 h-3" /> Unfeature
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-2 text-xs gap-1",
                featuredCount.current >= featuredCount.max
                  ? "border-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "border-zinc-600 text-zinc-300 hover:border-violet-500/50 hover:text-violet-300",
              )}
              onClick={() => handleFeature(true)}
              disabled={pending || item.isHidden || featuredCount.current >= featuredCount.max}
              title={
                featuredCount.current >= featuredCount.max
                  ? "Feature up to 6 items."
                  : "Add to Featured"
              }
            >
              <Star className="w-3 h-3" /> Feature
            </Button>
          )}

          {/* Move up / Move down (featured only) */}
          {item.isFeatured && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:text-zinc-100"
                onClick={handleMoveUp}
                disabled={pending || isFirst}
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:text-zinc-100"
                onClick={handleMoveDown}
                disabled={pending || isLast}
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Hide / Show */}
          {item.isHidden ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs gap-1 border-zinc-600 text-zinc-400 hover:text-zinc-100"
              onClick={() => handleHide(false)}
              disabled={pending}
              title="Show on profile"
            >
              <Eye className="w-3 h-3" /> Show
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs gap-1 border-zinc-600 text-zinc-400 hover:text-red-400 hover:border-red-500/30"
              onClick={() => handleHide(true)}
              disabled={pending}
              title="Hide from profile"
            >
              <EyeOff className="w-3 h-3" /> Hide
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [featuredCount, setFeaturedCount] = useState<FeaturedCount>({ current: 0, max: 6 });
  const [activeTab, setActiveTab] = useState<PlatformTab>("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCreatorContentAction().then((res) => {
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
      } else {
        setItems(res.items);
        setFeaturedCount(res.featuredCount);
      }
      setLoading(false);
    });
  }, [toast]);

  // Sync featuredCount whenever items change
  useEffect(() => {
    setFeaturedCount((prev) => ({
      ...prev,
      current: items.filter((i) => i.isFeatured).length,
    }));
  }, [items]);

  // Optimistic update for single item
  const handleOptimistic = (updated: ContentLibraryItem) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === updated.id ? updated : i,
      ),
    );
  };

  // Optimistic reorder: replace featured items in their new order
  const handleReorder = (newFeaturedOrder: ContentLibraryItem[]) => {
    const orderedIds = new Set(newFeaturedOrder.map((f) => f.id));
    setItems((prev) => {
      const nonFeatured = prev.filter((i) => !orderedIds.has(i.id));
      const updatedFeatured = newFeaturedOrder.map((item, idx) => ({
        ...item,
        featuredOrder: idx,
      }));
      // Keep featured items at the top, then non-featured
      return [...updatedFeatured, ...nonFeatured];
    });
  };

  // Filter by active tab
  const filtered =
    activeTab === "All"
      ? items
      : items.filter(
          (i) => i.platform.toLowerCase() === (TAB_PLATFORM_KEY[activeTab] ?? activeTab.toLowerCase()),
        );

  // Sorted list: featured first (by order), then hidden, then rest (by postedAt desc)
  const sorted = [
    ...filtered.filter((i) => i.isFeatured).sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0)),
    ...filtered.filter((i) => !i.isFeatured && !i.isHidden).sort((a, b) => {
      const tA = a.postedAt ? new Date(a.postedAt).getTime() : -Infinity;
      const tB = b.postedAt ? new Date(b.postedAt).getTime() : -Infinity;
      return tB - tA;
    }),
    ...filtered.filter((i) => i.isHidden).sort((a, b) => {
      const tA = a.postedAt ? new Date(a.postedAt).getTime() : -Infinity;
      const tB = b.postedAt ? new Date(b.postedAt).getTime() : -Infinity;
      return tB - tA;
    }),
  ];

  const featuredItems = items
    .filter((i) => i.isFeatured)
    .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));

  // Determine which platform tabs have content
  const tabsWithContent = PLATFORM_TABS.filter((tab) => {
    if (tab === "All") return true;
    const key = TAB_PLATFORM_KEY[tab] ?? tab.toLowerCase();
    return items.some((i) => i.platform.toLowerCase() === key);
  });

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-50 flex items-center gap-2">
              <Library className="w-6 h-6 text-violet-400" />
              Content
            </h1>
            <FeaturedCountBadge featuredCount={featuredCount} />
          </div>
          <p className="text-sm text-zinc-400">
            Choose what appears on your profile and highlight your best work.
          </p>
        </div>

        {/* Featured mode helper */}
        {featuredCount.current > 0 && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-300">
            <span className="font-semibold">Featured mode active.</span>{" "}
            Your profile shows your featured items instead of the automatic recent selection.
          </div>
        )}
        {featuredCount.current === 0 && !loading && items.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
            Once you feature content, your profile shows your featured items instead of the
            automatic recent selection.
          </div>
        )}

        {/* Platform tabs */}
        <div className="flex items-center gap-0 border-b border-zinc-800">
          {tabsWithContent.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <Library className="w-7 h-7 text-violet-400" />
            </div>
            <p className="font-semibold text-zinc-200 mb-1">No content yet</p>
            <p className="text-sm text-zinc-500 max-w-xs">
              Connect and sync your social accounts to manage your content library.
            </p>
          </div>
        )}

        {/* Content list */}
        {!loading && sorted.length > 0 && (
          <div className="space-y-3">
            {sorted.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                featuredCount={featuredCount}
                featuredItems={featuredItems}
                onOptimistic={handleOptimistic}
                onReorder={handleReorder}
              />
            ))}
          </div>
        )}

        {/* No content for selected tab */}
        {!loading && items.length > 0 && sorted.length === 0 && (
          <div className="py-12 text-center text-zinc-500 text-sm">
            No {activeTab} content in your library.
          </div>
        )}
      </div>
    </MainLayout>
  );
}
