import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Heart, MessageSquare, ExternalLink, MapPin, Users, TrendingUp, X, Sparkles, UserSearch, Filter, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useFavorites } from "@/app/_components/favorites/FavoritesContext";
import { RichEmptyState } from "@/app/_components/shared/RichEmptyState";
import { getCreatorsAction } from "@/app/actions/discover";
import type { Creator } from "@/app/_components/discovery/ProfileDrawer";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";

const platforms = [
  { value: "all", label: "All Platforms" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter/X" },
  { value: "twitch", label: "Twitch" },
  { value: "linkedin", label: "LinkedIn" },
];

const niches = [
  "All Niches", "Lifestyle", "Tech Reviews", "Gaming", "Beauty & Makeup",
  "Fashion", "Fitness", "Food & Cooking", "Travel", "Comedy", "Education", "Music", "Business"
];

const followerRanges = [
  { value: "all", label: "Any Size" },
  { value: "nano", label: "Nano (1K-10K)" },
  { value: "micro", label: "Micro (10K-100K)" },
  { value: "mid", label: "Mid-tier (100K-500K)" },
  { value: "macro", label: "Macro (500K-1M)" },
  { value: "mega", label: "Mega (1M+)" },
];

const platformIcons: Record<string, string> = {
  youtube: "🎬",
  tiktok: "📱",
  instagram: "📸",
  twitter: "𝕏",
  twitch: "🎮",
  linkedin: "💼",
};

const platformColors: Record<string, string> = {
  youtube: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  tiktok: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  twitter: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  twitch: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  linkedin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const Feed = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { isInAnyCollection, toggleInCollection } = useFavorites();
  const { openChatWindow } = useMessaging();

  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [niche, setNiche] = useState("All Niches");
  const [followerRange, setFollowerRange] = useState("all");

  // ── Fetch creators on mount ──────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    getCreatorsAction()
      .then(setCreators)
      .finally(() => setLoading(false));
  }, []);

  const toggleSave = (creator: Creator, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!profile) return;
    const isSaved = isInAnyCollection(creator.id);
    toggleInCollection("col-shortlist", {
      profileId: creator.id,
      profileType: "creator",
      savedAt: new Date().toISOString(),
      snapshot: {
        displayName: creator.full_name ?? "Creator",
        avatarUrl: creator.avatar_url,
        subtitle: creator.niche,
        primaryPlatform: creator.primary_platform,
      },
    });
    toast({ title: isSaved ? "Removed from saved" : "Saved to Shortlist!" });
  };

  const handleMessage = (creator: Creator, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openChatWindow({
      id: creator.id,
      full_name: creator.full_name,
      avatar_url: creator.avatar_url,
      user_type: "creator",
    });
  };

  const filteredCreators = creators.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.niche ?? "").toLowerCase().includes(q) ||
        (c.bio ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (platform !== "all") {
      const hasPlatform = c.primary_platform === platform ||
        (c.platforms && Object.keys(c.platforms).includes(platform));
      if (!hasPlatform) return false;
    }
    if (niche !== "All Niches") {
      if (!(c.niche ?? "").toLowerCase().includes(niche.toLowerCase())) return false;
    }
    if (followerRange !== "all") {
      const n = c.total_followers;
      if (followerRange === "nano" && !(n >= 1000 && n < 10000)) return false;
      if (followerRange === "micro" && !(n >= 10000 && n < 100000)) return false;
      if (followerRange === "mid" && !(n >= 100000 && n < 500000)) return false;
      if (followerRange === "macro" && !(n >= 500000 && n < 1000000)) return false;
      if (followerRange === "mega" && !(n >= 1000000)) return false;
    }
    return true;
  });

  const formatFollowers = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const activeFiltersCount = [
    platform !== "all",
    niche !== "All Niches",
    followerRange !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setPlatform("all");
    setNiche("All Niches");
    setFollowerRange("all");
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Discover Creators</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Find and connect with top content creators
          </p>
        </div>

        {/* Search Bar - LinkedIn Style */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, niche, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 bg-secondary/50 border-0 focus-visible:ring-1"
              />
            </div>
            <Button
              variant={filtersOpen ? "default" : "outline"}
              size="default"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="gap-2 shrink-0"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </div>

          {/* Expandable Filters */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent className="pt-4 mt-4 border-t border-border">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Platform</label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {platforms.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Niche</label>
                  <Select value={niche} onValueChange={setNiche}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {niches.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audience Size</label>
                  <Select value={followerRange} onValueChange={setFollowerRange}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {followerRanges.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {activeFiltersCount > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {platform !== "all" && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        {platforms.find(p => p.value === platform)?.label}
                        <button onClick={() => setPlatform("all")} className="ml-1 hover:bg-muted rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                    {niche !== "All Niches" && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        {niche}
                        <button onClick={() => setNiche("All Niches")} className="ml-1 hover:bg-muted rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                    {followerRange !== "all" && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        {followerRanges.find(f => f.value === followerRange)?.label}
                        <button onClick={() => setFollowerRange("all")} className="ml-1 hover:bg-muted rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    Clear all
                  </Button>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Results Count */}
        {!loading && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{filteredCreators.length}</span>
              {" "}creator{filteredCreators.length !== 1 ? "s" : ""} found
              {filteredCreators.length !== creators.length && (
                <span className="ml-1">out of {creators.length}</span>
              )}
            </p>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Creator Cards - LinkedIn Style */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="overflow-hidden animate-pulse">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-xl bg-muted shrink-0" />
                    <div className="flex-1 space-y-3 py-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-4 bg-muted rounded w-1/4" />
                        <div className="h-6 bg-muted rounded-full w-20" />
                      </div>
                      <div className="h-3.5 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-4/5" />
                      <div className="flex gap-6 mt-2">
                        <div className="h-3 bg-muted rounded w-20" />
                        <div className="h-3 bg-muted rounded w-16" />
                      </div>
                      <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                        <div className="h-8 bg-muted rounded-lg w-24" />
                        <div className="h-8 bg-muted rounded-lg w-20" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredCreators.length > 0 ? (
          <div className="space-y-3">
            {filteredCreators.map((creator) => (
              <Link key={creator.id} href={`/profile/${creator.id}`}>
                <Card className="overflow-hidden hover:shadow-md transition-all duration-200 hover:border-primary/30 group">
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {/* Avatar */}
                      <Avatar className="w-16 h-16 shrink-0 border-2 border-border">
                        <AvatarImage src={creator.avatar_url || undefined} alt={creator.full_name || ''} />
                        <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                          {creator.full_name?.charAt(0) || 'C'}
                        </AvatarFallback>
                      </Avatar>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                {creator.full_name || "Creator"}
                              </h3>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {creator.niche || "Content Creator"}
                            </p>
                          </div>
                          
                          {/* Platform Badge */}
                          {creator.primary_platform && (
                            <Badge 
                              variant="secondary" 
                              className={`shrink-0 ${platformColors[creator.primary_platform] || ''}`}
                            >
                              {platformIcons[creator.primary_platform]} {creator.primary_platform}
                            </Badge>
                          )}
                        </div>

                        {/* Bio */}
                        {creator.bio && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {creator.bio}
                          </p>
                        )}

                        {/* Stats Row */}
                        <div className="flex items-center flex-wrap gap-4 mt-3">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{formatFollowers(creator.total_followers)}</span>
                            <span className="text-muted-foreground">followers</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-sm">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            <span className="font-medium text-green-600">{creator.avg_engagement_rate}%</span>
                            <span className="text-muted-foreground">engagement</span>
                          </div>

                          {creator.location && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4" />
                              <span>{creator.location}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8"
                            onClick={(e) => handleMessage(creator, e)}
                          >
                            <MessageSquare className="w-4 h-4 mr-1" />
                            Message
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-8 transition-colors ${isInAnyCollection(creator.id) ? "border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" : ""}`}
                            onClick={(e) => toggleSave(creator, e)}
                          >
                            <Heart className={`w-4 h-4 mr-1 transition-all ${isInAnyCollection(creator.id) ? "fill-red-500 text-red-500" : ""}`} />
                            {isInAnyCollection(creator.id) ? "Saved" : "Save"}
                          </Button>
                          <Link href={`/profile/${creator.id}`} className="ml-auto">
                            <Button variant="ghost" size="sm" className="h-8" onClick={(e) => e.stopPropagation()}>
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : searchQuery || platform !== "all" || niche !== "All Niches" || followerRange !== "all" ? (
          <RichEmptyState
            icon={<Filter className="w-8 h-8" />}
            headline="No creators match your filters"
            sub="Try broadening your search or adjusting the filters above."
            primary={{ label: "Clear all filters", onClick: () => { clearFilters(); setSearchQuery(""); } }}
            tips={[
              { icon: <X className="w-3.5 h-3.5" />, label: "Try removing the audience size filter" },
              { icon: <Search className="w-3.5 h-3.5" />, label: "Search by name or keyword" },
              { icon: <Layers className="w-3.5 h-3.5" />, label: "Use a broader niche category" },
            ]}
          />
        ) : (
          <RichEmptyState
            icon={<UserSearch className="w-8 h-8" />}
            headline="No creators yet"
            sub="Once creators complete onboarding and connect their platforms, they'll appear here for you to discover."
            primary={{ label: "Invite a creator", onClick: () => {} }}
            tips={[
              { icon: <Sparkles className="w-3.5 h-3.5" />, label: "Creators appear after connecting at least one platform" },
              { icon: <Filter className="w-3.5 h-3.5" />, label: "Use filters to narrow by niche, audience size, or platform" },
            ]}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default Feed;
