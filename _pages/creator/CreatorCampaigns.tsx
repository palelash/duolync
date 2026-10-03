"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  Search, DollarSign, Clock, Target, Megaphone,
  ChevronRight, X, CheckCircle2, Send, Loader2,
  Building2, ArrowUpDown, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import MainLayout from "@/components/layout/MainLayout";
import { RichEmptyState } from "@/app/_components/shared/RichEmptyState";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getPublicCampaignsAction,
  applyToCampaignAction,
  withdrawApplicationAction,
  getCreatorAvailablePlatformsAction,
  type PublicCampaign,
} from "@/app/actions/creator-campaigns";

// ── Platform emoji map ────────────────────────────────────────────────────────

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  twitter: "🐦",
  linkedin: "💼",
  pinterest: "📌",
  twitch: "🎮",
  snapchat: "👻",
};

// ── Status config ─────────────────────────────────────────────────────────────

const APP_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: {
    label: "Applied · Pending",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  ACCEPTED: {
    label: "Accepted 🎉",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  REJECTED: {
    label: "Not Selected",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    color: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBudget(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function timeUntilDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Expired";
  const days = Math.ceil(diff / 86_400_000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days}d left`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Platform labels (shared) ──────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  twitch: "Twitch",
  snapchat: "Snapchat",
};

// ── Apply Modal ───────────────────────────────────────────────────────────────

interface ApplyModalProps {
  campaign: PublicCampaign | null;
  onClose: () => void;
  onApplied: (campaignId: string, applicationId: string) => void;
}

function ApplyModal({ campaign, onClose, onApplied }: ApplyModalProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rate, setRate] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    setRate("");
    setCoverLetter("");
    setSelectedPlatform("");
    setPlatformsLoading(true);
    getCreatorAvailablePlatformsAction().then((res) => {
      const platforms = res.availablePlatforms.length > 0
        ? res.availablePlatforms
        : res.primaryPlatform
          ? [res.primaryPlatform]
          : [];
      setAvailablePlatforms(platforms);
      // Pre-select the first platform that matches campaign's required platforms, else first connected
      const campaignPlatforms = campaign.platforms.map((p) => p.toLowerCase());
      const match = platforms.find((p) => campaignPlatforms.includes(p.toLowerCase()));
      setSelectedPlatform(match ?? platforms[0] ?? "");
      setPlatformsLoading(false);
    });
  }, [campaign]);

  if (!campaign) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRate = parseFloat(rate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      toast({ variant: "destructive", title: "Please enter a valid rate." });
      return;
    }
    startTransition(async () => {
      const result = await applyToCampaignAction({
        campaignId: campaign.id,
        proposedRate: parsedRate,
        coverLetter: coverLetter || undefined,
        selectedPlatform: selectedPlatform || undefined,
      });
      if (result.error || !result.data) {
        toast({ variant: "destructive", title: result.error ?? "Failed to apply." });
        return;
      }
      toast({
        title: "Proposal sent! 🎉",
        description: `Your proposal for "${campaign.title}" was delivered to the brand.`,
      });
      onApplied(campaign.id, result.data.id);
      onClose();
    });
  };

  return (
    <Dialog open={!!campaign} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send Proposal
          </DialogTitle>
        </DialogHeader>

        {/* Campaign summary */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900/50 mb-1">
          <p className="font-semibold text-sm line-clamp-1">{campaign.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{campaign.brand.companyName}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Budget: {formatBudget(campaign.budget)}
            </span>
            {campaign.deadline && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeUntilDeadline(campaign.deadline)}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Platform selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Applying with account</label>
            {platformsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading your accounts…
              </div>
            ) : availablePlatforms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availablePlatforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPlatform(p)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all",
                      selectedPlatform === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    <span>{PLATFORM_EMOJI[p.toLowerCase()] ?? "🌐"}</span>
                    <span>{PLATFORM_LABEL[p.toLowerCase()] ?? p}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-sm text-muted-foreground">
                No connected accounts found — you can still apply without selecting one.
              </div>
            )}
          </div>

          {/* Rate */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Your Rate (USD) *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min={1}
                step={0.01}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={`Suggested: ${formatBudget(campaign.budget * 0.1)}`}
                className="pl-9"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">Enter the total amount you'd charge for this campaign.</p>
          </div>

          {/* Message to brand */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Message to brand</label>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              placeholder="Tell the brand why you're a great fit. Mention your audience, niche, past collaborations…"
              rows={4}
              maxLength={1000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{coverLetter.length}/1000</p>
          </div>

          <DialogFooter className="pt-1 flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Sending…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5" />
                  Send Proposal
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────

interface CampaignCardProps {
  campaign: PublicCampaign;
  onApply: (c: PublicCampaign) => void;
  onWithdraw: (applicationId: string, campaignId: string) => void;
  withdrawing: string | null;
}

function CampaignCard({ campaign, onApply, onWithdraw, withdrawing }: CampaignCardProps) {
  const appStatus = campaign.applicationStatus;
  const appMeta = appStatus ? APP_STATUS[appStatus] : null;
  const deadline = timeUntilDeadline(campaign.deadline);
  const isExpired = deadline === "Expired";
  const canApply = !appStatus && !isExpired;
  const canWithdraw = appStatus === "PENDING" && campaign.applicationId;
  const isWithdrawing = withdrawing === campaign.applicationId;

  return (
    <article className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-md dark:hover:shadow-black/20 transition-all duration-200 flex flex-col">
      {/* Image — clicking goes to detail page */}
      <Link href={`/creator/campaigns/${campaign.id}`} className="block">
        {campaign.imageUrl && (
          <div className="w-full h-32 overflow-hidden shrink-0">
            <img
              src={campaign.imageUrl}
              alt={campaign.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
      </Link>

      <div className="flex flex-col flex-1 p-4 sm:p-5 gap-3">
        {/* Header */}
        <div>
          {appMeta && (
            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mb-2", appMeta.color)}>
              {appMeta.label}
            </span>
          )}
          <Link href={`/creator/campaigns/${campaign.id}`} className="hover:underline underline-offset-2">
            <h3 className="font-bold text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {campaign.title}
            </h3>
          </Link>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <Link
              href={`/profile/${campaign.brand.userId}`}
              className="truncate font-medium hover:text-primary hover:underline underline-offset-2 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {campaign.brand.companyName}
            </Link>
            {campaign.brand.industry && (
              <span className="text-muted-foreground/60">· {campaign.brand.industry}</span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
          {campaign.description}
        </p>

        {/* Platforms */}
        {campaign.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {campaign.platforms.slice(0, 4).map((pid) => (
              <span
                key={pid}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              >
                {PLATFORM_EMOJI[pid] ?? "🌐"} {pid}
              </span>
            ))}
            {campaign.platforms.length > 4 && (
              <span className="text-xs text-muted-foreground self-center">+{campaign.platforms.length - 4}</span>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 font-semibold">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            {formatBudget(campaign.budget)}
          </div>
          {deadline && (
            <div className={cn("flex items-center gap-1.5 text-xs", isExpired ? "text-red-500" : "text-muted-foreground")}>
              <Clock className="w-3.5 h-3.5" />
              {deadline}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-auto pt-1 space-y-2">
          <Link
            href={`/creator/campaigns/${campaign.id}`}
            className="flex items-center justify-between text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <span>View full details & negotiate</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          {canApply ? (
            <Button
              onClick={() => onApply(campaign)}
              className="w-full"
              size="sm"
            >
              <Send className="w-3.5 h-3.5 mr-2" />
              Apply Now
            </Button>
          ) : canWithdraw ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-muted-foreground hover:text-red-500 hover:border-red-300"
              onClick={() => onWithdraw(campaign.applicationId!, campaign.id)}
              disabled={isWithdrawing}
            >
              {isWithdrawing ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5 mr-2" />
              )}
              Withdraw Application
            </Button>
          ) : appStatus === "ACCEPTED" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-semibold py-2">
              <CheckCircle2 className="w-4 h-4" />
              Application Accepted!
            </div>
          ) : appStatus === "REJECTED" || appStatus === "WITHDRAWN" ? (
            <p className="text-center text-xs text-muted-foreground py-2">
              {appStatus === "WITHDRAWN" ? "You withdrew this application." : "Not selected for this campaign."}
            </p>
          ) : isExpired ? (
            <p className="text-center text-xs text-muted-foreground py-2">This campaign has closed.</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const CreatorCampaigns = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "budget_high" | "deadline_soon">("newest");
  const [applying, setApplying] = useState<PublicCampaign | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<{ applicationId: string; campaignId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getPublicCampaignsAction();
    if (!result.error) setCampaigns(result.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optimistic apply
  const handleApplied = (campaignId: string, applicationId: string) => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? { ...c, applicationStatus: "PENDING", applicationId }
          : c,
      ),
    );
  };

  // Optimistic withdraw
  const handleWithdraw = async (applicationId: string, campaignId: string) => {
    setConfirmWithdrawId({ applicationId, campaignId });
  };

  const confirmWithdraw = async () => {
    if (!confirmWithdrawId) return;
    const { applicationId, campaignId } = confirmWithdrawId;
    setConfirmWithdrawId(null);
    setWithdrawing(applicationId);
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? { ...c, applicationStatus: "WITHDRAWN", applicationId: null }
          : c,
      ),
    );
    const result = await withdrawApplicationAction(applicationId);
    if (result.error) {
      toast({ variant: "destructive", title: result.error });
      load();
    } else {
      toast({ title: "Application withdrawn." });
    }
    setWithdrawing(null);
  };

  // Filtering + sorting
  const allPlatforms = Array.from(new Set(campaigns.flatMap((c) => c.platforms)));
  const filtered = [...campaigns]
    .filter((c) => {
      const matchSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.brand.companyName.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      const matchPlatform =
        platformFilter === "ALL" || c.platforms.includes(platformFilter);
      return matchSearch && matchPlatform;
    })
    .sort((a, b) => {
      if (sortBy === "budget_high") return b.budget - a.budget;
      if (sortBy === "deadline_soon") {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return 0; // "newest" — preserve server order
    });

  const appliedCount = campaigns.filter((c) => c.applicationStatus).length;

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Megaphone className="w-7 h-7 text-primary" />
            Browse Campaigns
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Discover active campaigns from brands looking for creators like you.
          </p>
          {appliedCount > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Send className="w-3.5 h-3.5" />
              {appliedCount} application{appliedCount !== 1 ? "s" : ""} submitted
            </div>
          )}
        </div>

        {/* Search + Sort */}
        <div className="flex gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns or brands…"
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[160px] shrink-0 gap-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="budget_high">Budget: High → Low</SelectItem>
              <SelectItem value="deadline_soon">Deadline: Soonest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Platform filter chips */}
        {allPlatforms.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            <button
              onClick={() => setPlatformFilter("ALL")}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                platformFilter === "ALL"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-primary/40 hover:text-foreground",
              )}
            >
              All platforms
            </button>
            {allPlatforms.map((pid) => (
              <button
                key={pid}
                onClick={() => setPlatformFilter(pid)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  platformFilter === pid
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-primary/40 hover:text-foreground",
                )}
              >
                <span className="text-sm leading-none">{PLATFORM_EMOJI[pid] ?? "🌐"}</span>
                <span>{PLATFORM_LABEL[pid] ?? pid}</span>
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-28 bg-zinc-200 dark:bg-zinc-700" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
                  <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  <div className="h-9 bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          search || platformFilter !== "ALL" ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
              </div>
              <p className="font-semibold text-sm mb-1">No campaigns match your filters</p>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                Try adjusting your search or selecting a different platform.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(""); setPlatformFilter("ALL"); }}
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Clear filters
              </Button>
            </div>
          ) : (
            <RichEmptyState
              icon={<Megaphone className="w-8 h-8 text-violet-500 dark:text-violet-400" />}
              headline="No active campaigns yet"
              sub="Brands are always launching new campaigns. Check back soon — or set up your profile to get invited directly."
              secondary={{ label: "Complete your creator profile →", href: "/creator/settings" }}
              tips={[
                { icon: <Sparkles className="w-3 h-3" />, label: "Connect your social accounts" },
                { icon: <Target className="w-3 h-3" />, label: "Set your niche & rates" },
                { icon: <Send className="w-3 h-3" />, label: "Accept direct invitations" },
              ]}
            />
          )
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              {filtered.length} campaign{filtered.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onApply={setApplying}
                  onWithdraw={handleWithdraw}
                  withdrawing={withdrawing}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Apply Modal */}
      <ApplyModal
        campaign={applying}
        onClose={() => setApplying(null)}
        onApplied={handleApplied}
      />

      {/* Withdraw confirmation */}
      <AlertDialog open={confirmWithdrawId !== null} onOpenChange={(open) => { if (!open) setConfirmWithdrawId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw application?</AlertDialogTitle>
            <AlertDialogDescription>
              Your application will be marked as withdrawn. You can re-apply to this campaign later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmWithdraw} className="bg-red-600 hover:bg-red-700 text-white">
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default CreatorCampaigns;
