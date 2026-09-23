"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, MessageSquare, MapPin, Globe, ExternalLink,
  Users, Send, Edit2, Plus, Trash2, Check, X, UserPlus,
  UserCheck, Clock, Briefcase, BarChart3, Link2, RefreshCw, Radio,
} from "lucide-react";
import { ReportButton } from "@/app/_components/report/ReportModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { VerifiedBadge } from "@/app/_components/shared/VerifiedBadge";
import { useMessaging } from "@/components/messaging/MessagingContext";
import MainLayout from "@/components/layout/MainLayout";
import {
  getProfileAction,
  updateProfileAction,
  updateSocialLinksAction,
  type PublicProfile,
  type SocialLink,
} from "@/app/actions/profile";
import { startApifySyncAction, pollApifyRunAction } from "@/app/actions/apify-sync";
import { deletePostAction } from "@/app/actions/social-posts";
import { sendMessageAction } from "@/app/actions/messages";
import {
  getConnectionStatusAction,
  sendConnectionRequestAction,
  withdrawConnectionAction,
  acceptConnectionAction,
  rejectConnectionAction,
  removeConnectionAction,
  type ConnectionStatusResult,
} from "@/app/actions/connections";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
};

const PLATFORM_EMOJIS: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  twitter: "🐦",
  linkedin: "💼",
  pinterest: "📌",
  twitch: "🎮",
  snapchat: "👻",
  facebook: "📘",
};

const PLATFORM_OPTIONS = [
  "Instagram", "TikTok", "YouTube", "Twitter", "LinkedIn",
  "Twitch", "Facebook", "Pinterest", "Snapchat", "Other",
];

// ─── Social Links Editor ───────────────────────────────────────────────────────

function SocialLinksSection({
  links,
  isOwn,
  onSave,
}: {
  links: SocialLink[];
  isOwn: boolean;
  onSave: (links: SocialLink[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SocialLink[]>(links);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const addLink = () => setDraft((prev) => [...prev, { platform: "Instagram", url: "" }]);
  const removeLink = (i: number) => setDraft((prev) => prev.filter((_, idx) => idx !== i));
  const updateLink = (i: number, field: keyof SocialLink, val: string) =>
    setDraft((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft.filter((l) => l.url.trim()));
    setSaving(false);
    setEditing(false);
    toast({ title: "Social links updated" });
  };

  if (!editing) {
    return (
      <div>
        {links.length === 0 && !isOwn ? null : (
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Social Links</h3>
            {isOwn && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => { setDraft(links); setEditing(true); }}
              >
                <Edit2 className="w-3 h-3" /> Edit
              </Button>
            )}
          </div>
        )}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url.startsWith("http") ? l.url : `https://${l.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-medium hover:border-primary hover:text-primary transition-colors"
              >
                <Link2 className="w-3 h-3" />
                {l.platform}
                <ExternalLink className="w-2.5 h-2.5 opacity-50" />
              </a>
            ))}
            {isOwn && (
              <button
                onClick={() => { setDraft(links); setEditing(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            )}
          </div>
        )}
        {links.length === 0 && isOwn && (
          <button
            onClick={() => { setDraft([]); setEditing(true); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Plus className="w-4 h-4" /> Add social links
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Social Links</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs btn-gradient" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : <><Check className="w-3 h-3 mr-1" />Save</>}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {draft.map((l, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              value={l.platform}
              onChange={(e) => updateLink(i, "platform", e.target.value)}
              className="h-9 px-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-background w-28 shrink-0"
            >
              {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <Input
              value={l.url}
              onChange={(e) => updateLink(i, "url", e.target.value)}
              placeholder="https://..."
              className="h-9 text-xs flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-muted-foreground hover:text-red-500 shrink-0"
              onClick={() => removeLink(i)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 w-full" onClick={addLink}>
          <Plus className="w-3 h-3" /> Add link
        </Button>
      </div>
    </div>
  );
}

// ─── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({
  profile,
  onSave,
  onClose,
}: {
  profile: PublicProfile;
  onSave: (data: Parameters<typeof updateProfileAction>[0]) => Promise<void>;
  onClose: () => void;
}) {
  const isCreator = profile.user_type === "creator";
  const [name, setName] = useState(profile.full_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [niche, setNiche] = useState(profile.niche ?? "");
  const [primaryPlatform, setPrimaryPlatform] = useState(profile.primary_platform ?? "");
  const [companyName, setCompanyName] = useState(profile.company_name ?? "");
  const [industry, setIndustry] = useState(profile.industry ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      name,
      bio,
      location,
      ...(isCreator ? { niche, primaryPlatform } : { companyName, industry, website }),
    });
    setSaving(false);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogDescription>Update your public profile information.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Display Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bio</label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people about yourself…"
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground mt-1">{bio.length}/500</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Location</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
        </div>
        {isCreator ? (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Niche / Categories</label>
              <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="beauty, fashion, lifestyle" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Primary Platform</label>
              <select
                value={primaryPlatform}
                onChange={(e) => setPrimaryPlatform(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-background"
              >
                <option value="">None</option>
                {["youtube", "tiktok", "instagram", "twitter", "twitch", "linkedin"].map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Company Name</label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Industry</label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Fashion, Tech…" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Website</label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="btn-gradient">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Connection Button ─────────────────────────────────────────────────────────

function ConnectButton({
  status,
  connectionId,
  onStatusChange,
}: {
  status: ConnectionStatusResult;
  connectionId: string | null;
  onStatusChange: (s: ConnectionStatusResult, id: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handle = async () => {
    setLoading(true);
    if (status === "none") {
      // handled by parent since we need targetId — passed via parent callback
      onStatusChange("pending_sent", null);
    } else if (status === "pending_sent" && connectionId) {
      await withdrawConnectionAction(connectionId);
      onStatusChange("none", null);
      toast({ title: "Request withdrawn" });
    } else if (status === "accepted" && connectionId) {
      await removeConnectionAction(connectionId);
      onStatusChange("none", null);
      toast({ title: "Connection removed" });
    }
    setLoading(false);
  };

  if (status === "pending_received" && connectionId) {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          className="gap-2 btn-gradient"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await acceptConnectionAction(connectionId);
            onStatusChange("accepted", connectionId);
            toast({ title: "Connected!" });
            setLoading(false);
          }}
        >
          <Check className="w-4 h-4" /> Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await rejectConnectionAction(connectionId);
            onStatusChange("rejected", null);
            toast({ title: "Request declined" });
            setLoading(false);
          }}
        >
          <X className="w-4 h-4" /> Decline
        </Button>
      </div>
    );
  }

  const label =
    status === "accepted" ? "Connected" :
    status === "pending_sent" ? "Pending" :
    "Connect";
  const Icon =
    status === "accepted" ? UserCheck :
    status === "pending_sent" ? Clock :
    UserPlus;

  return (
    <Button
      size="sm"
      variant={status === "none" ? "default" : "outline"}
      className={cn("gap-2", status === "none" && "btn-gradient")}
      disabled={loading}
      onClick={handle}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Button>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatItem({ icon: Icon, value, label, href }: { icon: React.ElementType; value: number | string; label: string; href?: string }) {
  const content = (
    <div className="flex flex-col items-center gap-0.5 p-3 text-center">
      <Icon className="w-4 h-4 text-muted-foreground mb-1" />
      <span className="text-lg font-bold font-display">{value}</span>
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
  if (href) return <Link href={href} className="hover:bg-secondary/50 rounded-lg transition-colors">{content}</Link>;
  return content;
}

// ─── Sync Data Modal ──────────────────────────────────────────────────────────

const SYNC_PLATFORMS = ["instagram", "tiktok"] as const;
type SyncPlatform = (typeof SYNC_PLATFORMS)[number];

function SyncDataModal({
  userId,
  onSynced,
  onClose,
}: {
  userId: string;
  onSynced: () => void;
  onClose: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<SyncPlatform>("instagram");
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Starting scrape…");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Clean up interval on unmount
  useEffect(() => () => stopPolling(), []);

  const handleSync = async () => {
    if (!handle.trim()) return;
    setSyncing(true);
    setResult(null);
    setStatusMsg("Starting scrape…");

    const start = await startApifySyncAction(userId, handle.trim(), platform);
    if ("error" in start) {
      setSyncing(false);
      setResult({ ok: false, message: start.error });
      toast({ title: "Sync failed", description: start.error, variant: "destructive" });
      return;
    }

    const { runId } = start;
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 3;
      setStatusMsg(`Scraping ${platform} data… ${elapsed}s`);

      const poll = await pollApifyRunAction(runId, userId);

      if (poll.state === "running") return; // keep waiting

      stopPolling();
      setSyncing(false);

      if (poll.state === "succeeded") {
        const { followerCount, averageEngagement } = poll.data;
        setResult({ ok: true, message: `Synced — ${followerCount.toLocaleString()} followers, ${averageEngagement}% engagement.` });
        toast({ title: "Analytics synced!", description: `Data updated from ${platform}.` });
        onSynced();
      } else {
        setResult({ ok: false, message: poll.error });
        toast({ title: "Sync failed", description: poll.error, variant: "destructive" });
      }
    }, 3_000);
  };

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          Sync Analytics
        </DialogTitle>
        <DialogDescription>
          We'll verify your public account to sync your latest follower count, engagement stats, and content niches.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Platform</label>
          <div className="grid grid-cols-2 gap-2">
            {SYNC_PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={cn(
                  "h-9 rounded-lg border text-sm font-medium capitalize transition-all",
                  platform === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-zinc-200 dark:border-zinc-700 text-muted-foreground hover:border-primary/50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {platform === "instagram" ? "Instagram" : "TikTok"} Username
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
              placeholder={platform === "instagram" ? "username" : "username"}
              className="pl-7"
              disabled={syncing}
              onKeyDown={(e) => e.key === "Enter" && handleSync()}
            />
          </div>
        </div>

        {result && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5 text-sm",
              result.ok
                ? "border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                : "border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400",
            )}
          >
            {result.message}
          </div>
        )}

        {syncing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            {statusMsg} — this may take up to 2 minutes.
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={syncing}>Cancel</Button>
        <Button
          onClick={handleSync}
          disabled={syncing || !handle.trim()}
          className="btn-gradient gap-2"
        >
          {syncing ? (
            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing…</>
          ) : (
            <><RefreshCw className="w-3.5 h-3.5" /> Sync Now</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Latest Posts Section ─────────────────────────────────────────────────────

type PostItem = NonNullable<PublicProfile["socialPosts"]>[number];

const PLATFORM_META_POSTS: Record<string, { label: string; emoji: string }> = {
  instagram: { label: "Instagram Posts", emoji: "📷" },
  tiktok: { label: "TikTok Posts", emoji: "📱" },
};

function PostThumbnail({
  post,
  isOwn,
  onDeleted,
}: {
  post: PostItem;
  isOwn: boolean;
  onDeleted: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const emoji = PLATFORM_META_POSTS[post.platform]?.emoji ?? "📱";

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    const res = await deletePostAction(post.id);
    setDeleting(false);
    if (res.error) {
      toast({ title: "Failed to remove post", description: res.error, variant: "destructive" });
    } else {
      onDeleted(post.id);
    }
  };

  const card = (
    <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 group relative cursor-pointer">
      {/* Delete button (own profile) */}
      {isOwn && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/70 border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/90"
          title="Remove post"
        >
          {deleting ? (
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <X className="w-3 h-3 text-white" />
          )}
        </button>
      )}

      {post.imageUrl && !imgError ? (
        <div className="aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
          <img
            src={post.imageUrl}
            alt={post.caption ?? "Post"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          {/* Stats overlay on hover */}
          {(post.likes != null || post.comments != null) && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs font-semibold">
              {post.likes != null && <span>❤️ {formatNumber(post.likes)}</span>}
              {post.comments != null && <span>💬 {formatNumber(post.comments)}</span>}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">
          {emoji}
        </div>
      )}

      {/* Caption — only show for image-less posts */}
      {(!post.imageUrl || imgError) && post.caption && (
        <div className="p-2.5">
          <p className="text-[11px] text-muted-foreground line-clamp-2">{post.caption}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            {post.likes != null && <span>❤️ {formatNumber(post.likes)}</span>}
            {post.comments != null && <span>💬 {formatNumber(post.comments)}</span>}
          </div>
        </div>
      )}
    </div>
  );

  return post.postUrl ? (
    <a href={post.postUrl} target="_blank" rel="noopener noreferrer">{card}</a>
  ) : (
    card
  );
}

function LatestPostsSection({
  posts,
  isOwn,
  onPostDeleted,
}: {
  posts: PostItem[];
  isOwn: boolean;
  onPostDeleted: (id: string) => void;
}) {
  const groups = Object.entries(PLATFORM_META_POSTS).map(([key, meta]) => ({
    key,
    meta,
    items: posts.filter((p) => p.platform === key).slice(0, 6),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display font-bold">Latest Posts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Recent content from connected platforms</p>
        </div>
        {isOwn && (
          <Button size="sm" asChild variant="outline" className="gap-2">
            <Link href="/creator/presence">
              <Radio className="w-3.5 h-3.5" /> Manage Connections
            </Link>
          </Button>
        )}
      </div>

      {groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map(({ key, meta, items }) => (
            <div key={key}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <span>{meta.emoji}</span> {meta.label}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {items.map((post) => (
                  <PostThumbnail
                    key={post.id}
                    post={post}
                    isOwn={isOwn}
                    onDeleted={onPostDeleted}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-3">
            <Radio className="w-7 h-7 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="font-semibold text-sm mb-1">No posts yet</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            Connect and sync your social accounts to display your latest content here.
          </p>
          {isOwn && (
            <Button size="sm" asChild className="gap-2 btn-gradient">
              <Link href="/creator/presence">Connect Accounts</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProfileView = ({ profileId }: { profileId?: string }) => {
  const params = useParams();
  const id = profileId ?? (params?.id as string | undefined);
  const router = useRouter();
  const { profile: currentUser } = useAuth();
  const { toast } = useToast();
  const { openChatWindow } = useMessaging();

  const [profileData, setProfileData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [connStatus, setConnStatus] = useState<ConnectionStatusResult>("none");
  const [connId, setConnId] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalText, setProposalText] = useState("");
  const [sendingProposal, setSendingProposal] = useState(false);

  useEffect(() => {
    if (!id) return;
    getProfileAction(id).then((data) => {
      if (!data) setNotFound(true);
      else setProfileData(data);
      setLoading(false);
    });
    getConnectionStatusAction(id).then((info) => {
      setConnStatus(info.status);
      setConnId(info.connectionId);
    });
  }, [id]);

  const handleMessage = () => {
    if (!profileData || !currentUser) return;
    openChatWindow({
      id: profileData.userId,
      full_name: profileData.full_name,
      avatar_url: profileData.avatar_url,
      user_type: profileData.user_type,
    });
  };

  const handleConnect = async () => {
    if (!id) return;
    const res = await sendConnectionRequestAction(id);
    if (!res.error && res.connectionId) {
      setConnStatus("pending_sent");
      setConnId(res.connectionId);
      toast({ title: "Connection request sent!" });
    } else if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    }
  };

  const handleSaveProfile = async (data: Parameters<typeof updateProfileAction>[0]) => {
    const res = await updateProfileAction(data);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      if (id) {
        getProfileAction(id).then((d) => { if (d) setProfileData(d); });
      }
    }
  };

  const handleSaveSocialLinks = async (links: SocialLink[]) => {
    const res = await updateSocialLinksAction(links);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else if (id) {
      getProfileAction(id).then((d) => { if (d) setProfileData(d); });
    }
  };

  const handleSendProposal = async () => {
    if (!profileData || !currentUser || !proposalText.trim()) return;
    setSendingProposal(true);
    const res = await sendMessageAction(profileData.userId, proposalText.trim());
    setSendingProposal(false);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else {
      toast({ title: "Proposal sent!" });
      setProposalText("");
      setShowProposalModal(false);
      openChatWindow({
        id: profileData.userId,
        full_name: profileData.full_name,
        avatar_url: profileData.avatar_url,
        user_type: profileData.user_type,
      });
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
          {/* Back button placeholder */}
          <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />

          {/* Profile card skeleton */}
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl shadow-sm">
            {/* Cover */}
            <div className="h-36 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded-t-2xl" />
            <div className="px-6 pb-6">
              {/* Avatar row */}
              <div className="flex items-end justify-between -mt-12 mb-4 relative z-10">
                <div className="w-24 h-24 rounded-xl bg-zinc-300 dark:bg-zinc-600 ring-4 ring-white dark:ring-zinc-900 animate-pulse" />
                <div className="flex gap-2 pb-1">
                  <div className="h-8 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                  <div className="h-8 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                </div>
              </div>
              {/* Name + badges */}
              <div className="space-y-2 mb-4">
                <div className="h-7 w-44 bg-zinc-200 dark:bg-zinc-700 rounded-lg animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-4 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
                  <div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
                </div>
                <div className="h-3 w-28 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-0 border border-zinc-200/60 dark:border-zinc-800/80 rounded-xl overflow-hidden mb-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 p-3">
                    <div className="h-4 w-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    <div className="h-5 w-10 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    <div className="h-2.5 w-14 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
              {/* Bio lines */}
              <div className="space-y-1.5">
                <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-4/5 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-3/5 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Second card skeleton */}
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm space-y-3">
            <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (notFound || !profileData) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
          </div>
          <h1 className="font-display text-2xl font-bold mb-2">Profile not found</h1>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
            This profile doesn&apos;t exist or may have been removed.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const isCreator = profileData.user_type === "creator";
  const isOwnProfile = currentUser?.id === profileData.userId;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {/* Back navigation */}
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* ── Profile card (LinkedIn-style) ── */}
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl shadow-sm">
          {/* Cover */}
          <div
            className={cn(
              "h-36 w-full relative overflow-hidden rounded-t-2xl",
              isCreator
                ? "bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600"
                : "bg-gradient-to-br from-teal-700 via-cyan-600 to-sky-500",
            )}
          >
            {/* Subtle mesh overlay */}
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 40%)" }} />
          </div>

          <div className="px-6 pb-6">
            {/* Avatar row */}
            <div className="flex items-end justify-between -mt-12 mb-4 relative z-10">
              <div className="w-24 h-24 rounded-2xl ring-4 ring-white dark:ring-zinc-900 overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-lg shrink-0">
                {profileData.avatar_url ? (
                  <img src={profileData.avatar_url} alt={profileData.full_name ?? ""} className="w-full h-full object-cover" />
                ) : (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center text-3xl font-bold text-white",
                    isCreator ? "bg-gradient-to-br from-violet-600 to-purple-600" : "bg-gradient-to-br from-teal-600 to-cyan-600",
                  )}>
                    {(profileData.full_name ?? "U")[0].toUpperCase()}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {isOwnProfile ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowEditModal(true)}>
                      <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                    </Button>
                    {isCreator && (
                      <>
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowSyncModal(true)}>
                          <RefreshCw className="w-3.5 h-3.5" /> Sync Data
                        </Button>
                        <Button size="sm" asChild className="gap-2 btn-gradient">
                          <Link href="/creator/presence">
                            <Radio className="w-3.5 h-3.5" /> Manage Connections
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                ) : currentUser ? (
                  <>
                    {connStatus === "none" ? (
                      <Button size="sm" className="gap-2 btn-gradient" onClick={handleConnect}>
                        <UserPlus className="w-4 h-4" /> Connect
                      </Button>
                    ) : (
                      <ConnectButton
                        status={connStatus}
                        connectionId={connId}
                        onStatusChange={(s, cid) => {
                          const prev = connStatus;
                          setConnStatus(s);
                          setConnId(cid);
                          // Refresh profile whenever the accepted-connection count changes:
                          // • new status is "accepted"  → a request was just accepted (+1)
                          // • prev status was "accepted" → a connection was just removed (-1)
                          if (id && (s === "accepted" || prev === "accepted")) {
                            getProfileAction(id).then((d) => { if (d) setProfileData(d); });
                          }
                        }}
                      />
                    )}
                    <Button size="sm" variant="outline" className="gap-2" onClick={handleMessage}>
                      <MessageSquare className="w-3.5 h-3.5" /> Message
                    </Button>
                    {currentUser.user_type === "brand" && isCreator && (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowProposalModal(true)}>
                        <Send className="w-3.5 h-3.5" /> Proposal
                      </Button>
                    )}
                    <ReportButton
                      targetUser={{
                        id: profileData.userId,
                        name: profileData.full_name,
                        type: profileData.user_type,
                      }}
                      variant="icon"
                      className="h-8 w-8 border border-zinc-200 dark:border-zinc-700"
                    />
                  </>
                ) : null}
              </div>
            </div>

            {/* Name + badges */}
            <div className="mb-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <h1 className="font-display text-2xl font-bold">{profileData.full_name ?? "User"}</h1>
                {isCreator && <VerifiedBadge show={profileData.verified} size="md" />}
                <Badge variant={isCreator ? "default" : "secondary"} className="capitalize text-xs">
                  {profileData.user_type}
                </Badge>
                {isCreator && profileData.primary_platform && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {PLATFORM_EMOJIS[profileData.primary_platform.toLowerCase()] ?? "🌐"}{" "}
                    {profileData.primary_platform.charAt(0).toUpperCase() + profileData.primary_platform.slice(1)}
                  </span>
                )}
              </div>

              {isCreator ? (
                <>
                  {profileData.niche && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {profileData.niche.split(",").map((n) => n.trim()).filter(Boolean).map((n) => (
                        <span
                          key={n}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-500/20"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {profileData.company_name && (
                    <p className="font-medium text-sm mb-0.5">{profileData.company_name}</p>
                  )}
                  {profileData.industry && (
                    <p className="text-muted-foreground text-sm mb-2">{profileData.industry}</p>
                  )}
                </>
              )}

              {/* Meta */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {profileData.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {profileData.location}
                  </span>
                )}
                {profileData.website && (
                  <a href={profileData.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline">
                    <Globe className="w-3 h-3" /> {profileData.website.replace(/^https?:\/\//, "")}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-0 border border-zinc-200/60 dark:border-zinc-800/80 rounded-xl overflow-hidden mb-4">
              <StatItem icon={Users} value={formatNumber(profileData.connectionCount)} label="Connections" />
              {isCreator ? (
                <>
                  <div className="border-x border-zinc-200/60 dark:border-zinc-800/80">
                    <StatItem
                      icon={BarChart3}
                      value={`${(profileData.averageEngagement ?? profileData.avg_engagement_rate).toFixed(2)}%`}
                      label="Eng Rate"
                    />
                  </div>
                  <StatItem
                    icon={Users}
                    value={formatNumber(profileData.followerCount ?? profileData.total_followers)}
                    label="Followers"
                  />
                </>
              ) : (
                <>
                  <div className="border-x border-zinc-200/60 dark:border-zinc-800/80">
                    <StatItem icon={Briefcase} value={profileData.campaigns.length} label="Campaigns" />
                  </div>
                  <StatItem icon={Users} value={profileData.communityListCount ?? 0} label="Lists" />
                </>
              )}
            </div>

            {/* Bio */}
            {profileData.bio ? (
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{profileData.bio}</p>
            ) : isOwnProfile ? (
              <button
                onClick={() => setShowEditModal(true)}
                className="text-sm text-muted-foreground hover:text-primary mb-4 block transition-colors"
              >
                + Add a bio
              </button>
            ) : null}

            {/* Social links */}
            <SocialLinksSection
              links={profileData.socialLinks ?? []}
              isOwn={isOwnProfile}
              onSave={handleSaveSocialLinks}
            />
          </div>
        </div>

        {/* ── Platform Stats ── */}
        {isCreator && profileData.platformStats.length > 0 && (
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm">
            <h2 className="font-display font-bold mb-4">Platform Stats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profileData.platformStats.map((s) => (
                <div
                  key={s.platform}
                  className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50"
                >
                  <span className="text-2xl shrink-0 leading-none">
                    {PLATFORM_EMOJIS[s.platform.toLowerCase()] ?? "🌐"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold capitalize">{s.platform}</p>
                    <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                      {s.followerCount != null && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatNumber(s.followerCount)} followers
                        </span>
                      )}
                      {s.engagementRate != null && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {s.engagementRate}% eng
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Apify Analytics (creator only) ── */}
        {isCreator && (
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display font-bold">Rich Analytics</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Synced from your public profile</p>
              </div>
              <div className="flex items-center gap-2">
              {profileData.lastSyncedAt ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  Synced {new Date(profileData.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
                  Not Connected
                </span>
              )}
              {isOwnProfile && (
                <button
                  onClick={() => setShowSyncModal(true)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  title="Sync analytics"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Follower Count */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4">
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Follower Count</p>
                {profileData.followerCount != null ? (
                  <p className="text-2xl font-bold">
                    {profileData.followerCount >= 1_000_000
                      ? `${(profileData.followerCount / 1_000_000).toFixed(1)}M`
                      : profileData.followerCount >= 1_000
                        ? `${(profileData.followerCount / 1_000).toFixed(0)}K`
                        : profileData.followerCount.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500 font-medium mt-1">Not Connected</p>
                )}
              </div>

              {/* Average Engagement */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4">
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Avg. Engagement</p>
                {profileData.averageEngagement != null ? (
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {profileData.averageEngagement.toFixed(2)}%
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500 font-medium mt-1">Not Connected</p>
                )}
              </div>
            </div>

            {/* Top Niches */}
            <div className="mb-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Top Niches</p>
              {profileData.topNiches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profileData.topNiches.map((niche) => (
                    <span
                      key={niche}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                    >
                      {niche}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 font-medium">Not Connected</p>
              )}
            </div>
          </div>
        )}

        {/* ── Latest Posts (creator) ── */}
        {isCreator && (
          <LatestPostsSection
            posts={profileData.socialPosts ?? []}
            isOwn={isOwnProfile}
            onPostDeleted={(id) => {
              setProfileData((prev) =>
                prev ? { ...prev, socialPosts: (prev.socialPosts ?? []).filter((p) => p.id !== id) } : prev,
              );
            }}
          />
        )}

        {/* ── Active Campaigns (for brands) ── */}
        {!isCreator && profileData.campaigns.length > 0 && (
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm">
            <h2 className="font-display font-bold mb-4">Active Campaigns</h2>
            <div className="space-y-3">
              {profileData.campaigns.map((c) => (
                <div key={c.id} className="flex items-start justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">${c.budget.toLocaleString()}</p>
                    <Badge
                      variant={c.status === "ACTIVE" ? "default" : "secondary"}
                      className="text-[10px] capitalize mt-0.5"
                    >
                      {c.status.toLowerCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sync Analytics Modal */}
      <Dialog open={showSyncModal} onOpenChange={setShowSyncModal}>
        {showSyncModal && (
          <SyncDataModal
            userId={profileData.userId}
            onSynced={() => {
              setShowSyncModal(false);
              if (id) getProfileAction(id).then((d) => { if (d) setProfileData(d); });
            }}
            onClose={() => setShowSyncModal(false)}
          />
        )}
      </Dialog>

      {/* Edit Profile Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <EditProfileModal
          profile={profileData}
          onSave={handleSaveProfile}
          onClose={() => setShowEditModal(false)}
        />
      </Dialog>

      {/* Proposal Modal */}
      <Dialog open={showProposalModal} onOpenChange={setShowProposalModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Proposal</DialogTitle>
            <DialogDescription>
              Send a collaboration proposal to {profileData.full_name ?? "this creator"}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Describe your campaign, budget expectations, and what you're looking for…"
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1">{proposalText.length}/2000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProposalModal(false)}>Cancel</Button>
            <Button
              onClick={handleSendProposal}
              disabled={sendingProposal || !proposalText.trim()}
              className="btn-gradient gap-2"
            >
              <Send className="w-4 h-4" />
              {sendingProposal ? "Sending…" : "Send Proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default ProfileView;
