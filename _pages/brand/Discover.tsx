"use client";
import { useState, useMemo, useEffect, useCallback, useTransition, useRef } from "react";
import {
  Search, SlidersHorizontal, Heart, MessageSquare, X,
  MapPin, Users, TrendingUp, ChevronDown, ListPlus, Check, Plus,
  UserPlus, UserCheck, Clock, Send, DollarSign, Loader2, Megaphone, Mail,
  Sparkles, Zap, RotateCcw,
} from "lucide-react";
import { VerifiedBadge } from "@/app/_components/shared/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import MainLayout from "@/components/layout/MainLayout";
import ProfileDrawer, {
  type Creator, PlatformBadge, PLATFORM_META,
} from "@/components/discovery/ProfileDrawer";
import SaveCollectionModal, { type SaveTarget } from "@/components/favorites/SaveCollectionModal";
import { useProfiles } from "@/components/discovery/ProfilesContext";
import { useFavorites } from "@/components/favorites/FavoritesContext";
import { useMessaging } from "@/components/messaging/MessagingContext";
import { useAuth } from "@/hooks/useAuth";
import {
  getCommunityListsAction,
  createCommunityListAction,
  addCreatorToListAction,
  removeCreatorFromListAction,
  type CommunityListWithCount,
} from "@/app/actions/communities";
import {
  sendConnectionRequestAction,
  withdrawConnectionAction,
  getConnectionStatusesAction,
  type ConnectionStatusResult,
  type ConnectionInfo,
} from "@/app/actions/connections";
import {
  getBrandCampaignsAction,
  type CampaignData,
} from "@/app/actions/campaigns";
import { sendBrandInvitationAction } from "@/app/actions/invitations";
import { runAIMatchmakerAction, type MatchedCreator } from "@/app/actions/ai";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const VIOLET = "#c084fc";

const AI_EXAMPLE_QUERIES = [
  "Skincare creators, women 25–40, high engagement on Instagram",
  "Gaming TikTok creators 500K+, 5%+ ER",
  "Eco-conscious fashion creators, US & Europe",
];

// Seed profiles have short IDs like "c1", "c3". Real cuid IDs are 25+ chars.
function isRealProfile(id: string) {
  return id.length > 10;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "twitch"];

const NICHES = [
  "All Niches", "Tech", "Lifestyle", "Gaming", "Beauty", "Fashion",
  "Fitness", "Food", "Travel", "Comedy", "Education", "Music", "Sustainability",
];

const REACH_RANGES = [
  { value: "all",   label: "Any" },
  { value: "nano",  label: "<50K" },
  { value: "micro", label: "50K–200K" },
  { value: "mid",   label: "200K–1M" },
  { value: "mega",  label: "1M+" },
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

// ─── Invite to Campaign Modal ─────────────────────────────────────────────────

interface InviteModalProps {
  creator: Creator | null;
  onClose: () => void;
}

function InviteToCampaignModal({ creator, onClose }: InviteModalProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState("");

  useEffect(() => {
    if (!creator) return;
    setCampaignId(""); setMessage(""); setBudget("");
    getBrandCampaignsAction().then(({ data }) => {
      const active = data.filter((c) => c.status === "ACTIVE");
      setCampaigns(active);
      if (active.length === 1) setCampaignId(active[0].id);
    });
  }, [creator]);

  if (!creator) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId) {
      toast({ variant: "destructive", title: "Please select a campaign." });
      return;
    }
    startTransition(async () => {
      const result = await sendBrandInvitationAction({
        creatorUserId: creator.id,
        campaignId,
        message: message || undefined,
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
      onClose();
    });
  };

  return (
    <Dialog open={!!creator} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Invite to Campaign
          </DialogTitle>
          <DialogDescription>
            Send a collaboration invite to{" "}
            <span className="font-semibold text-foreground">{creator.full_name}</span>.
            They&apos;ll receive a notification and can accept or decline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Campaign selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Select Campaign *</label>
            {campaigns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-muted-foreground text-center">
                No active campaigns found.{" "}
                <a href="/brand/campaigns" className="text-primary hover:underline">
                  Create one first →
                </a>
              </div>
            ) : (
              <Select value={campaignId} onValueChange={setCampaignId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an active campaign…" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <Megaphone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{c.title}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          ${c.budget.toLocaleString()}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Budget offer */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Offered Budget (USD)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min={1}
                step={100}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 1500"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">Optional — leave blank to discuss budget later.</p>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Message / Brief</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce your brand, describe the deliverables, timeline, and any creative direction…"
              rows={4}
              maxLength={1000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
          </div>

          <DialogFooter className="pt-1 flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || campaigns.length === 0}
              className="w-full sm:w-auto gap-2"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add to Community Dropdown ────────────────────────────────────────────────
// Receives lists from parent. On toggle, calls onMemberToggled so parent can
// do an optimistic update — no stale checkboxes on re-open.

function AddToCommunityMenu({
  creatorId,
  lists,
  onCreateList,
  onMemberToggled,
}: {
  creatorId: string;
  lists: CommunityListWithCount[];
  onCreateList: () => void;
  onMemberToggled: (listId: string, added: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const toggle = async (list: CommunityListWithCount) => {
    const isMember = list.memberUserIds.includes(creatorId);
    setLoading(list.id);
    const result = isMember
      ? await removeCreatorFromListAction(list.id, creatorId)
      : await addCreatorToListAction(list.id, creatorId);
    setLoading(null);
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      // Optimistically update parent so re-opening dropdown shows correct state
      onMemberToggled(list.id, !isMember);
      toast({
        title: isMember ? "Removed from list" : "Added to list",
        description: isMember ? `Removed from "${list.name}"` : `Added to "${list.name}"`,
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-200 dark:hover:border-violet-500/40 hover:text-violet-600 dark:hover:text-violet-400 shrink-0 transition-colors"
          aria-label="Add to community"
          title="Add to Community"
        >
          <ListPlus className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Add to Community
        </div>
        <DropdownMenuSeparator />
        {lists.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No lists yet</div>
        ) : (
          lists.map((list) => {
            const isMember = list.memberUserIds.includes(creatorId);
            return (
              <DropdownMenuItem
                key={list.id}
                onClick={() => toggle(list)}
                disabled={loading === list.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    isMember
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "border-zinc-300 dark:border-zinc-600",
                  )}
                >
                  {isMember && <Check className="w-2.5 h-2.5" />}
                </span>
                <span className="truncate text-sm">{list.name}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {list.memberCount}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateList} className="flex items-center gap-2 cursor-pointer">
          <Plus className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm text-primary">New list…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

const CreatorCard = ({
  creator,
  isSaved,
  onSave,
  onViewProfile,
  onMessage,
  onInvite,
  communityLists,
  onCreateCommunityList,
  onMemberToggled,
  connectionInfo,
  onConnectionChange,
}: {
  creator: Creator;
  isSaved: boolean;
  onSave: (target: SaveTarget) => void;
  onViewProfile: (c: Creator) => void;
  onMessage: (c: Creator) => void;
  onInvite: (c: Creator) => void;
  communityLists: CommunityListWithCount[];
  onCreateCommunityList: () => void;
  onMemberToggled: (listId: string, added: boolean) => void;
  connectionInfo: ConnectionInfo;
  onConnectionChange: (creatorId: string, status: ConnectionStatusResult, connectionId: string | null) => void;
}) => {
  const { toast } = useToast();
  // Local state mirrors the server-sourced connectionInfo; updates immediately on action
  const [connStatus, setConnStatus] = useState<ConnectionStatusResult>(connectionInfo.status);
  const [connId, setConnId] = useState<string | null>(connectionInfo.connectionId);
  const [connLoading, setConnLoading] = useState(false);

  // Sync when parent updates (e.g. bulk fetch completes after initial render)
  useEffect(() => {
    setConnStatus(connectionInfo.status);
    setConnId(connectionInfo.connectionId);
  }, [connectionInfo.status, connectionInfo.connectionId]);

  const handleConnect = async () => {
    if (connStatus === "accepted" || connStatus === "pending_received") return;
    setConnLoading(true);
    if (connStatus === "pending_sent" && connId) {
      const res = await withdrawConnectionAction(connId);
      if (!res.error) {
        setConnStatus("none");
        setConnId(null);
        onConnectionChange(creator.id, "none", null);
        toast({ title: "Request withdrawn" });
      }
    } else if (connStatus === "none") {
      const res = await sendConnectionRequestAction(creator.id);
      if (!res.error && res.connectionId) {
        setConnStatus("pending_sent");
        setConnId(res.connectionId);
        onConnectionChange(creator.id, "pending_sent", res.connectionId);
        toast({ title: "Connection request sent!" });
      } else if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      }
    }
    setConnLoading(false);
  };

  const tags = getNicheTags(creator.niche);
  const initials = creator.full_name
    ? creator.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "??";
  const platformEntries = Object.entries(creator.platforms ?? {}).slice(0, 3);

  return (
    <div className="group relative flex flex-col bg-white dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-none hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_40px_rgba(0,0,0,0.45)] hover:-translate-y-0.5">
      {/* Save button */}
      <button
        onClick={() =>
          onSave({
            profileId: creator.id,
            profileType: "creator",
            snapshot: {
              displayName: creator.full_name,
              avatarUrl: creator.avatar_url,
              subtitle: creator.niche,
              primaryPlatform: creator.primary_platform,
            },
          })
        }
        aria-label={isSaved ? "Manage collections" : "Save creator"}
        className="absolute top-3.5 right-3.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm dark:shadow-none"
      >
        <Heart
          className={cn(
            "w-3.5 h-3.5 transition-colors",
            isSaved ? "fill-rose-500 text-rose-500" : "text-zinc-400 dark:text-neutral-400 group-hover:text-zinc-600 dark:group-hover:text-neutral-300"
          )}
        />
      </button>

      <div className="p-5 flex flex-col flex-1">
        {/* Avatar + name */}
        <div className="flex items-start gap-3 mb-4 pr-8">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden ring-2 ring-zinc-200/80 dark:ring-zinc-700/50">
              {creator.avatar_url ? (
                <img src={creator.avatar_url} alt={creator.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-base font-bold text-zinc-400 dark:text-neutral-400">
                  {initials}
                </div>
              )}
            </div>
            {creator.primary_platform && (
              <div className="absolute -bottom-1 -right-1">
                <PlatformBadge platform={creator.primary_platform} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-display font-bold text-[15px] truncate text-zinc-900 dark:text-zinc-50">{creator.full_name}</span>
              <VerifiedBadge show={creator.verified} />
            </div>
            {creator.location && (
              <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{creator.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Niche tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((tag) => (
              <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-500/20 font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Platform stats */}
        {platformEntries.length > 0 && (
          <div className="flex items-center gap-3 py-2.5 mb-3 border-y border-zinc-200/60 dark:border-zinc-800/60">
            {platformEntries.map(([p, count]) => {
              const url = creator.social_links?.[p];
              const inner = (
                <div key={p} className="flex items-center gap-1.5">
                  <PlatformBadge platform={p} />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{count}</span>
                </div>
              );
              return url ? (
                <a
                  key={p}
                  href={url.startsWith("http") ? url : `https://${url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${PLATFORM_META[p]?.label ?? p} profile`}
                  className="hover:opacity-80 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  {inner}
                </a>
              ) : inner;
            })}
          </div>
        )}

        {creator.bio && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4 leading-relaxed">{creator.bio}</p>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-0 border border-zinc-200/60 dark:border-zinc-800/80 rounded-xl overflow-hidden mb-4 mt-auto">
          <div className="flex flex-col items-center py-3 px-2">
            <div className="flex items-center gap-1 mb-0.5">
              <Users className="w-3 h-3 text-zinc-400 dark:text-muted-foreground" />
              <span className="text-sm font-display font-bold text-zinc-800 dark:text-zinc-200">{formatReach(creator.total_followers)}</span>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Reach</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2 border-x border-zinc-200/60 dark:border-zinc-800/80">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-display font-bold text-emerald-600 dark:text-emerald-400">{creator.avg_engagement_rate}%</span>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Eng Rate</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2">
            <span className="text-sm font-display font-bold truncate w-full text-center text-zinc-800 dark:text-zinc-200">
              {creator.location?.split(",")[0] ?? "—"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">Location</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {/* Primary row */}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs btn-gradient rounded-xl font-semibold" onClick={() => onViewProfile(creator)}>
              View Profile
            </Button>

          {/* Connect button — only shown for real DB profiles */}
          {isRealProfile(creator.id) && <Button
            variant="ghost"
            size="sm"
            disabled={connLoading || connStatus === "accepted" || connStatus === "pending_received"}
            title={
              connStatus === "accepted" ? "Connected" :
              connStatus === "pending_sent" ? "Click to withdraw request" :
              connStatus === "pending_received" ? "They sent you a request" :
              "Send connection request"
            }
            onClick={handleConnect}
            className={cn(
              "h-8 w-8 p-0 rounded-xl border shrink-0 transition-colors",
              connStatus === "accepted"
                ? "border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10"
                : connStatus === "pending_sent"
                ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                : connStatus === "pending_received"
                ? "border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
                : "border-zinc-200 dark:border-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/40 hover:text-blue-600 dark:hover:text-blue-400",
            )}
          >
            {connStatus === "accepted" ? (
              <UserCheck className="w-3.5 h-3.5" />
            ) : connStatus === "pending_sent" || connStatus === "pending_received" ? (
              <Clock className="w-3.5 h-3.5" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
          </Button>}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-500/10 hover:border-teal-200 dark:hover:border-teal-500/40 hover:text-teal-600 dark:hover:text-teal-400 shrink-0 transition-colors"
            aria-label="Send message"
            onClick={() => onMessage(creator)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
          <AddToCommunityMenu
            creatorId={creator.id}
            lists={communityLists}
            onCreateList={onCreateCommunityList}
            onMemberToggled={onMemberToggled}
          />
          </div>
          {/* Invite button — only for real DB profiles */}
          {isRealProfile(creator.id) && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs rounded-xl font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/60 transition-colors"
              onClick={() => onInvite(creator)}
            >
              <Mail className="w-3.5 h-3.5" />
              Invite to Campaign
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Skeleton & Empty ─────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-5 animate-pulse shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-none">
    <div className="flex gap-3 mb-4 pr-8">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-3/4" />
        <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-1/2" />
      </div>
    </div>
    <div className="flex gap-2 mb-3">
      <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
      <div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
    </div>
    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-full mb-2" />
    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-4/5 mb-4" />
    <div className="flex gap-2">
      <div className="flex-1 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
      <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
    </div>
  </div>
);

const EmptyState = ({ isFiltered, onClear }: { isFiltered: boolean; onClear: () => void }) => (
  <div className="col-span-full flex flex-col items-center py-20 px-6 text-center">
    <div className="relative mb-6">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Search className="w-8 h-8 text-primary/50" />
      </div>
      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full gradient-primary shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
    </div>
    <h3 className="font-display text-xl font-bold mb-2">
      {isFiltered ? "No creators match your filters" : "No creators yet"}
    </h3>
    <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-6">
      {isFiltered ? "Try broadening your terms or removing some filters." : "Creators are joining Duolync every day — check back soon."}
    </p>
    {isFiltered && (
      <Button variant="outline" size="sm" className="gap-2 border-neutral-800 hover:border-neutral-600" onClick={onClear}>
        <X className="w-3.5 h-3.5" />Clear all filters
      </Button>
    )}
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const Discover = () => {
  const { profile } = useAuth();
  const { creators } = useProfiles();
  const { isInAnyCollection } = useFavorites();
  const { openChatWindow } = useMessaging();

  const [loading] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);

  // ── AI Search state ────────────────────────────────────────────────────────
  const [aiQuery, setAiQuery] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<MatchedCreator[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const unifiedInputRef = useRef<HTMLInputElement>(null);

  const runAISearch = async (q?: string) => {
    const query = (q ?? aiQuery).trim();
    if (!query || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiResults(null);
    const { data, error } = await runAIMatchmakerAction(query);
    setAiLoading(false);
    if (error) { setAiError(error); return; }
    setAiResults(data);
  };

  function clearAISearch() {
    setAiResults(null);
    setAiError(null);
    setAiQuery("");
    setTimeout(() => unifiedInputRef.current?.focus(), 50);
  }

  function toggleAiMode() {
    const next = !aiMode;
    setAiMode(next);
    if (!next) {
      setAiResults(null);
      setAiError(null);
      setAiQuery("");
    }
    setTimeout(() => unifiedInputRef.current?.focus(), 100);
  }

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);

  // Community lists
  const [communityLists, setCommunityLists] = useState<CommunityListWithCount[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const { toast } = useToast();

  // ── Connection statuses (keyed by creator userId) ──────────────────────────
  // Server-sourced on load so status persists across refreshes.
  const [connectionStatuses, setConnectionStatuses] = useState<
    Record<string, ConnectionInfo>
  >({});

  // Fetch lists on mount
  useEffect(() => {
    getCommunityListsAction().then((res) => {
      if (!res.error) setCommunityLists(res.data);
    });
  }, []);

  // Fetch all connection statuses once creators are loaded (single batch call)
  useEffect(() => {
    if (creators.length === 0) return;
    const ids = creators.map((c) => c.id);
    getConnectionStatusesAction(ids).then(setConnectionStatuses);
  }, [creators]);

  // Optimistic update for community list membership
  const handleMemberToggled = useCallback(
    (listId: string, creatorId: string, added: boolean) => {
      setCommunityLists((prev) =>
        prev.map((l) => {
          if (l.id !== listId) return l;
          const ids = added
            ? [...l.memberUserIds, creatorId]
            : l.memberUserIds.filter((id) => id !== creatorId);
          return {
            ...l,
            memberUserIds: ids,
            memberCount: ids.length,
          };
        }),
      );
    },
    [],
  );

  // Optimistic update for connection status
  const handleConnectionChange = useCallback(
    (
      creatorId: string,
      status: ConnectionStatusResult,
      connectionId: string | null,
    ) => {
      setConnectionStatuses((prev) => ({
        ...prev,
        [creatorId]: { status, connectionId },
      }));
    },
    [],
  );

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setCreatingList(true);
    const res = await createCommunityListAction(newListName);
    setCreatingList(false);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else if (res.data) {
      setCommunityLists((prev) => [...prev, res.data!]);
      setNewListName("");
      setShowCreateListModal(false);
      toast({ title: "List created", description: `"${res.data.name}" is ready.` });
    }
  };

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [niche, setNiche] = useState("All Niches");
  const [reachRange, setReachRange] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Invite to campaign state
  const [inviteTarget, setInviteTarget] = useState<Creator | null>(null);

  const handleMessage = (creator: Creator) => {
    if (!profile) return;
    openChatWindow({
      id: creator.id,
      full_name: creator.full_name,
      avatar_url: creator.avatar_url,
      user_type: "creator",
    });
  };

  const openProfile = (creator: Creator) => {
    setSelectedCreator(creator);
    setDrawerOpen(true);
  };

  const togglePlatform = (p: string) =>
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const clearFilters = () => {
    setSearchQuery(""); setSelectedPlatforms([]); setNiche("All Niches"); setReachRange("all");
  };

  const filtered = useMemo(
    () => creators.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!c.full_name?.toLowerCase().includes(q) && !c.niche?.toLowerCase().includes(q) && !c.location?.toLowerCase().includes(q)) return false;
      }
      if (selectedPlatforms.length > 0 && (!c.primary_platform || !selectedPlatforms.includes(c.primary_platform))) return false;
      if (niche !== "All Niches" && !c.niche?.toLowerCase().includes(niche.toLowerCase())) return false;
      if (!matchesReach(c.total_followers, reachRange)) return false;
      return true;
    }),
    [creators, searchQuery, selectedPlatforms, niche, reachRange]
  );

  const activeFilterCount = selectedPlatforms.length + (niche !== "All Niches" ? 1 : 0) + (reachRange !== "all" ? 1 : 0);
  const isFiltered = !!searchQuery || activeFilterCount > 0;

  return (
    <MainLayout>
      <ProfileDrawer
        creator={selectedCreator}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onMessage={handleMessage}
      />

      <SaveCollectionModal target={saveTarget} onClose={() => setSaveTarget(null)} />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold mb-1">Discover Creators</h1>
          <p className="text-muted-foreground text-sm">
            Find and connect with the perfect content creators for your brand
          </p>
        </div>

        {/* ── Unified search bar row ─────────────────────────────────────────── */}
        <div className="flex gap-2.5 mb-0">
          {/* Search / AI input */}
          <div className="flex-1 relative group">
            {/* Dynamic leading icon */}
            {aiMode ? (
              <Sparkles
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors"
                style={{ color: VIOLET }}
              />
            ) : (
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-colors" />
            )}

            {/* AI mode badge inside input (right side) */}
            {aiMode && (
              <span
                className="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden sm:inline-flex items-center gap-1 select-none"
                style={{
                  background: "rgba(124,58,237,0.2)",
                  color: VIOLET,
                  border: "1px solid rgba(192,132,252,0.3)",
                }}
              >
                AI
              </span>
            )}

            {/* Clear button (AI mode only) */}
            {aiMode && (aiQuery || aiResults) && (
              <button
                onClick={clearAISearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors z-10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <input
              ref={unifiedInputRef}
              value={aiMode ? aiQuery : searchQuery}
              onChange={(e) =>
                aiMode ? setAiQuery(e.target.value) : setSearchQuery(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && aiMode) runAISearch();
              }}
              placeholder={
                aiMode
                  ? "Describe who you're looking for… e.g. 'Skincare brand targeting 25-34F, 100K+ on Instagram'"
                  : "Search by name, niche, or location…"
              }
              className={cn(
                "w-full h-11 pl-10 pr-4 rounded-md text-sm outline-none transition-all duration-300 border",
                aiMode
                  ? "bg-zinc-950 dark:bg-[#0c0a12] border-violet-500/50 text-white placeholder:text-zinc-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-primary/50 focus:ring-2 focus:ring-primary/10",
                aiMode && aiQuery && "pr-24 sm:pr-28",
              )}
              style={
                aiMode
                  ? { boxShadow: "0 0 0 1px rgba(124,58,237,0.25), 0 4px 20px rgba(109,40,217,0.15)" }
                  : undefined
              }
            />
          </div>

          {/* AI mode toggle */}
          <button
            type="button"
            onClick={toggleAiMode}
            title={aiMode ? "Switch to normal search" : "Enable AI natural-language search"}
            className={cn(
              "h-11 shrink-0 flex items-center gap-2 px-3.5 rounded-xl text-sm font-semibold transition-all duration-200 border",
              aiMode || aiResults
                ? "text-violet-200 border-violet-500/50"
                : "text-violet-400 border-violet-500/20 hover:border-violet-500/50 hover:text-violet-300",
            )}
            style={{
              background:
                aiMode || aiResults
                  ? "rgba(124,58,237,0.22)"
                  : "rgba(124,58,237,0.07)",
              boxShadow:
                aiMode || aiResults
                  ? "0 0 0 1px rgba(192,132,252,0.25), 0 4px 16px rgba(109,40,217,0.2)"
                  : undefined,
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI</span>
          </button>

          {/* Run AI search button — shown only in AI mode */}
          {aiMode && (
            <Button
              size="sm"
              onClick={() => runAISearch()}
              disabled={!aiQuery.trim() || aiLoading}
              className="h-11 px-4 shrink-0 gap-1.5 text-sm font-semibold border-none rounded-xl"
              style={{
                background:
                  aiQuery.trim() && !aiLoading
                    ? "linear-gradient(135deg, #7c3aed, #c084fc)"
                    : "rgba(255,255,255,0.06)",
                color: "#fff",
                opacity: aiQuery.trim() && !aiLoading ? 1 : 0.45,
              }}
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{aiLoading ? "Matching…" : "Find"}</span>
            </Button>
          )}

          {/* Filters button — hidden in AI mode */}
          {!aiMode && (
            <Button
              variant="outline"
              className={cn(
                "h-11 gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 shrink-0 transition-colors rounded-xl",
                showFilters && "border-primary/60 text-primary bg-primary/5",
              )}
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showFilters && "rotate-180")} />
            </Button>
          )}
        </div>

        {/* ── AI inline panel (example chips, loading, results summary) ──────── */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            aiMode ? "max-h-[200px] opacity-100 mt-2 mb-2" : "max-h-0 opacity-0 pointer-events-none",
          )}
        >
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: "rgba(12,10,18,0.55)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(192,132,252,0.18)",
            }}
          >
            {/* Example chips */}
            {!aiResults && !aiLoading && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-zinc-600 font-medium self-center mr-1">Try:</span>
                {AI_EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setAiQuery(ex); runAISearch(ex); }}
                    className="text-[11px] px-2.5 py-1 rounded-full transition-all hover:opacity-90"
                    style={{
                      background: "rgba(192,132,252,0.08)",
                      border: "1px solid rgba(192,132,252,0.18)",
                      color: VIOLET,
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {aiLoading && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: VIOLET, animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-zinc-500">AI is analyzing creators…</span>
              </div>
            )}

            {/* Error */}
            {aiError && <p className="text-xs text-red-400">{aiError}</p>}

            {/* Results summary */}
            {aiResults && !aiLoading && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: VIOLET }} />
                  <span>
                    <span className="font-semibold" style={{ color: VIOLET }}>{aiResults.length}</span>
                    {" "}AI-ranked match{aiResults.length !== 1 ? "es" : ""} for &ldquo;{aiQuery}&rdquo;
                  </span>
                </div>
                <button
                  onClick={clearAISearch}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* mb-3 spacer when AI mode is off */}
        {!aiMode && <div className="mb-3" />}

        {/* Filter panel */}
        <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", showFilters ? "max-h-96 opacity-100 mb-4" : "max-h-0 opacity-0")}>
          <div className="bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Platform</p>
              <div className="flex flex-wrap gap-2">
                {FILTER_PLATFORMS.map((p) => {
                  const active = selectedPlatforms.includes(p);
                  return (
                    <button key={p} onClick={() => togglePlatform(p)}
                      className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150",
                        active ? "border-primary bg-primary/10 text-primary" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-zinc-500 dark:text-muted-foreground hover:border-zinc-300 dark:hover:border-neutral-600 hover:text-zinc-900 dark:hover:text-foreground"
                      )}
                    >
                      <PlatformBadge platform={p} />
                      {PLATFORM_META[p]?.label ?? p}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Niche / Category</p>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger className="h-9 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Audience Reach</p>
                <div className="flex flex-wrap gap-2">
                  {REACH_RANGES.map((r) => (
                    <button key={r.value} onClick={() => setReachRange(r.value)}
                      className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150",
                        reachRange === r.value ? "border-primary bg-primary/10 text-primary" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-zinc-500 dark:text-muted-foreground hover:border-zinc-300 dark:hover:border-neutral-600 hover:text-zinc-900 dark:hover:text-foreground"
                      )}
                    >{r.label}</button>
                  ))}
                </div>
              </div>
            </div>
            {isFiltered && (
              <div className="flex items-center justify-between pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <span className="text-xs text-muted-foreground">{filtered.length} creator{filtered.length !== 1 ? "s" : ""}</span>
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <X className="w-3 h-3" />Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Active filter chips + count */}
        <div className="flex items-center justify-between mb-6 gap-4 min-h-[28px]">
          <div className="flex flex-wrap gap-2">
            {[
              ...selectedPlatforms.map((p) => PLATFORM_META[p]?.label ?? p),
              niche !== "All Niches" ? niche : null,
              reachRange !== "all" ? REACH_RANGES.find((r) => r.value === reachRange)?.label : null,
              searchQuery ? `"${searchQuery}"` : null,
            ].filter(Boolean).map((chip, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-primary/10 text-primary/80 border border-primary/20 font-medium">
                {chip as string}
                <button onClick={() => {
                  const pKey = Object.entries(PLATFORM_META).find(([, v]) => v.label === chip)?.[0];
                  if (pKey) togglePlatform(pKey);
                  else if (chip === niche) setNiche("All Niches");
                  else if (chip === REACH_RANGES.find((r) => r.value === reachRange)?.label) setReachRange("all");
                  else setSearchQuery("");
                }}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          {!loading && (
            <span className="text-xs text-muted-foreground shrink-0">{filtered.length} creator{filtered.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Grid — AI results override normal filtered list */}
        {aiResults && !aiLoading ? (
          <>
            {aiResults.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Users className="w-10 h-10 text-muted-foreground/30" />
                <p className="font-medium">No creators matched your AI query</p>
                <p className="text-sm text-muted-foreground">Try broadening your description or use the filters below.</p>
                <Button variant="outline" size="sm" onClick={clearAISearch} className="gap-2 mt-1">
                  <RotateCcw className="w-3.5 h-3.5" />Back to all creators
                </Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {aiResults.map((aiCreator) => {
                  const c = creators.find((cr) => cr.id === aiCreator.id);
                  if (!c) return null;
                  return (
                    <CreatorCard
                      key={c.id}
                      creator={c}
                      isSaved={isInAnyCollection(c.id)}
                      onSave={setSaveTarget}
                      onViewProfile={openProfile}
                      onMessage={handleMessage}
                      onInvite={setInviteTarget}
                      communityLists={communityLists}
                      onCreateCommunityList={() => setShowCreateListModal(true)}
                      onMemberToggled={(listId, added) => handleMemberToggled(listId, c.id, added)}
                      connectionInfo={connectionStatuses[c.id] ?? { status: "none", connectionId: null }}
                      onConnectionChange={handleConnectionChange}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : filtered.length > 0 ? (
              filtered.map((c) => (
                <CreatorCard
                  key={c.id}
                  creator={c}
                  isSaved={isInAnyCollection(c.id)}
                  onSave={setSaveTarget}
                  onViewProfile={openProfile}
                  onMessage={handleMessage}
                  onInvite={setInviteTarget}
                  communityLists={communityLists}
                  onCreateCommunityList={() => setShowCreateListModal(true)}
                  onMemberToggled={(listId, added) => handleMemberToggled(listId, c.id, added)}
                  connectionInfo={connectionStatuses[c.id] ?? { status: "none", connectionId: null }}
                  onConnectionChange={handleConnectionChange}
                />
              ))
            ) : (
              <EmptyState isFiltered={isFiltered} onClear={clearFilters} />
            )}
          </div>
        )}
      </div>

      {/* Invite to Campaign Modal */}
      <InviteToCampaignModal
        creator={inviteTarget}
        onClose={() => setInviteTarget(null)}
      />

      {/* Create Community List Modal */}
      <Dialog open={showCreateListModal} onOpenChange={setShowCreateListModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Community List</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder='e.g. "Gamer Creators", "Beauty Influencers"'
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); }}
              maxLength={60}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1.5">{newListName.length}/60 characters</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateListModal(false); setNewListName(""); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={creatingList || !newListName.trim()} className="btn-gradient">
              {creatingList ? "Creating…" : "Create List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Discover;
