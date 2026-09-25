"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Megaphone,
  AlertCircle,
  ChevronDown,
  Eye,
  X,
  Globe,
  MapPin,
  Users,
  TrendingUp,
  Target,
  Calendar,
  DollarSign,
  Layers,
  Building2,
  Link2,
  BadgeCheck,
  Search,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  approveCreator,
  rejectCreator,
  setPendingCreator,
  approveCampaign,
  rejectCampaign,
  setPendingCampaign,
} from "@/app/admin/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PendingCreator {
  id: string;
  userId: string;
  bio: string | null;
  niche: string | null;
  location: string | null;
  totalFollowers: number;
  avgEngagementRate: number;
  primaryPlatform: string | null;
  socialLinks: unknown;
  connectedPlatforms: string[];
  moderationStatus: string;
  moderationNote: string | null;
  moderatedAt: Date | null;
  user: {
    name: string | null;
    email: string;
    image: string | null;
    createdAt: Date;
  };
}

export interface PendingCampaign {
  id: string;
  title: string;
  description: string;
  budget: number;
  status: string;
  moderationStatus: string;
  moderationNote: string | null;
  moderatedAt: Date | null;
  createdAt: Date;
  deadline: Date | null;
  requirements: string | null;
  briefDescription: string | null;
  goal: string | null;
  dosAndDonts: string | null;
  platforms: string[];
  contentFormats: string[];
  minFollowers: number | null;
  imageUrl: string | null;
  brand: {
    companyName: string;
    industry: string | null;
    website: string | null;
    bio: string | null;
  };
}

// ── Social link helpers ───────────────────────────────────────────────────────

function parseSocialLinks(raw: unknown): { platform: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as { platform?: string; url?: string }[]).filter(
    (l) => l?.platform && l?.url,
  ) as { platform: string; url: string }[];
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  twitter: "🐦",
  linkedin: "💼",
  twitch: "🎮",
  facebook: "📘",
  pinterest: "📌",
  snapchat: "👻",
};

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  if (status === "APPROVED")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    );
  if (status === "REJECTED")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  showNote,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
  showNote: boolean;
}) {
  const [note, setNote] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h3 className="mb-2 text-lg font-semibold text-zinc-100">{title}</h3>
        <p className="mb-4 text-sm text-zinc-400">{description}</p>
        {showNote && (
          <textarea
            className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            rows={3}
            placeholder="Rejection reason (optional)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Creator Preview Modal ─────────────────────────────────────────────────────

function CreatorPreviewModal({
  creator,
  onClose,
}: {
  creator: PendingCreator;
  onClose: () => void;
}) {
  const socialLinks = parseSocialLinks(creator.socialLinks);
  const nicheTags = creator.niche
    ? creator.niche.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header accent */}
        <div className="h-0.5 w-full bg-gradient-to-r from-violet-600 to-indigo-500" />

        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-violet-400" />
            <h3 className="font-semibold text-zinc-100">Creator Preview</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
          {/* Avatar + name */}
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {creator.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={creator.user.image}
                  alt={creator.user.name ?? ""}
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-zinc-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 ring-2 ring-zinc-700">
                  <User className="h-8 w-8 text-zinc-500" />
                </div>
              )}
              {creator.moderationStatus === "APPROVED" && (
                <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 border border-zinc-700">
                  <BadgeCheck className="h-4 w-4 text-violet-500" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-xl font-bold text-zinc-100 truncate">
                  {creator.user.name ?? "—"}
                </h2>
                {creator.moderationStatus === "APPROVED" && (
                  <BadgeCheck className="h-5 w-5 shrink-0 text-violet-500" aria-label="Verified" />
                )}
              </div>
              <p className="text-sm text-zinc-500">{creator.user.email}</p>
              {creator.location && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-zinc-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {creator.location}
                </div>
              )}
              <div className="mt-2">
                <StatusPill status={creator.moderationStatus} />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <div className="flex flex-col items-center py-3 px-2 gap-0.5">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-zinc-400" />
                <span className="text-base font-bold text-zinc-200">
                  {formatFollowers(creator.totalFollowers)}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Followers</span>
            </div>
            <div className="flex flex-col items-center py-3 px-2 gap-0.5 border-x border-zinc-800">
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-400" />
                <span className="text-base font-bold text-emerald-400">
                  {creator.avgEngagementRate.toFixed(1)}%
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Eng Rate</span>
            </div>
            <div className="flex flex-col items-center py-3 px-2 gap-0.5">
              <span className="text-base font-bold text-zinc-200">
                {creator.connectedPlatforms.length || "—"}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Platforms</span>
            </div>
          </div>

          {/* Bio */}
          {creator.bio && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">About</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{creator.bio}</p>
            </div>
          )}

          {/* Niche / Categories */}
          {nicheTags.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Categories / Niche</p>
              <div className="flex flex-wrap gap-1.5">
                {nicheTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-400 border border-violet-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Primary Platform */}
          {creator.primaryPlatform && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Primary Platform</p>
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {PLATFORM_ICONS[creator.primaryPlatform.toLowerCase()] ?? "🔗"}
                </span>
                <span className="text-sm font-medium text-zinc-300 capitalize">
                  {creator.primaryPlatform}
                </span>
              </div>
            </div>
          )}

          {/* Social Links */}
          {socialLinks.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Social Links</p>
              <div className="space-y-2">
                {socialLinks.map((link) => (
                  <a
                    key={link.platform}
                    href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                  >
                    <span>{PLATFORM_ICONS[link.platform.toLowerCase()] ?? "🔗"}</span>
                    <span className="capitalize font-medium">{link.platform}</span>
                    <span className="ml-auto truncate max-w-[180px] text-xs text-zinc-500">
                      {link.url}
                    </span>
                    <Link2 className="h-3 w-3 shrink-0 text-zinc-600" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Moderation note */}
          {creator.moderationNote && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">Moderation Note</p>
              <p className="text-sm text-zinc-400 italic">{creator.moderationNote}</p>
            </div>
          )}

          {/* Joined */}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            Joined {new Date(creator.user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        <div className="border-t border-zinc-800 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campaign Preview Modal ────────────────────────────────────────────────────

function CampaignPreviewModal({
  campaign,
  onClose,
}: {
  campaign: PendingCampaign;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header accent */}
        <div className="h-0.5 w-full bg-gradient-to-r from-blue-500 to-violet-600" />

        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-400" />
            <h3 className="font-semibold text-zinc-100">Campaign Preview</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
          {/* Title + Status */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-xl font-bold text-zinc-100 leading-tight">{campaign.title}</h2>
              <StatusPill status={campaign.moderationStatus} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex rounded-full bg-zinc-700/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
                {campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase().replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Brand details */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-3">Brand</p>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-zinc-500" />
              <span className="font-semibold text-zinc-200">{campaign.brand.companyName}</span>
            </div>
            {campaign.brand.industry && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Layers className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                {campaign.brand.industry}
              </div>
            )}
            {campaign.brand.website && (
              <a
                href={campaign.brand.website.startsWith("http") ? campaign.brand.website : `https://${campaign.brand.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                {campaign.brand.website}
              </a>
            )}
            {campaign.brand.bio && (
              <p className="text-xs text-zinc-400 leading-relaxed pt-1 border-t border-zinc-800">
                {campaign.brand.bio}
              </p>
            )}
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-3 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <div className="flex flex-col items-center py-3 px-2 gap-0.5">
              <div className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-base font-bold text-emerald-400">
                  ${campaign.budget.toLocaleString()}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Budget</span>
            </div>
            <div className="flex flex-col items-center py-3 px-2 gap-0.5 border-x border-zinc-800">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-base font-bold text-zinc-200">
                  {campaign.minFollowers ? formatFollowers(campaign.minFollowers) : "Any"}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Min Reach</span>
            </div>
            <div className="flex flex-col items-center py-3 px-2 gap-0.5">
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-sm font-bold text-zinc-200">
                  {campaign.deadline
                    ? new Date(campaign.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : "Open"}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Deadline</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Description</p>
            <p className="text-sm text-zinc-400 leading-relaxed">{campaign.description}</p>
          </div>

          {/* Goal */}
          {campaign.goal && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Campaign Goal</p>
              <div className="flex items-start gap-2 text-sm text-zinc-400">
                <Target className="h-4 w-4 shrink-0 text-violet-400 mt-0.5" />
                <p className="leading-relaxed">{campaign.goal}</p>
              </div>
            </div>
          )}

          {/* Brief description */}
          {campaign.briefDescription && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Creative Brief</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{campaign.briefDescription}</p>
            </div>
          )}

          {/* Requirements / Deliverables */}
          {campaign.requirements && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Requirements &amp; Deliverables</p>
              <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{campaign.requirements}</p>
            </div>
          )}

          {/* Do&apos;s and Don&apos;ts */}
          {campaign.dosAndDonts && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Dos &amp; Don&apos;ts</p>
              <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{campaign.dosAndDonts}</p>
            </div>
          )}

          {/* Platforms */}
          {campaign.platforms.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Target Platforms</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.platforms.map((p) => (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300"
                  >
                    <span>{PLATFORM_ICONS[p.toLowerCase()] ?? "🔗"}</span>
                    <span className="capitalize">{p}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Content formats */}
          {campaign.contentFormats.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Content Formats</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.contentFormats.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Moderation note */}
          {campaign.moderationNote && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">Moderation Note</p>
              <p className="text-sm text-zinc-400 italic">{campaign.moderationNote}</p>
            </div>
          )}

          {/* Submitted */}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            Submitted {new Date(campaign.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        <div className="border-t border-zinc-800 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status action dropdown ────────────────────────────────────────────────────

type DialogState = {
  type: "approve" | "reject";
  id: string;
  label: string;
  kind: "creator" | "campaign";
} | null;

function StatusDropdown({
  currentStatus,
  onApprove,
  onReject,
  onPending,
  isPending: isTransitioning,
}: {
  currentStatus: string;
  onApprove: () => void;
  onReject: () => void;
  onPending: () => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  // Ensure portal target is available (avoids SSR mismatch)
  useEffect(() => { setMounted(true); }, []);

  // Estimated menu height (3 items + divider ≈ 115px). Used only to decide
  // flip direction before the menu is painted; actual content is unchanged.
  const MENU_HEIGHT = 120;

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < MENU_HEIGHT + 8 && rect.top > MENU_HEIGHT + 8;

      setMenuStyle({
        position: "fixed",
        // Flip: if not enough room below, anchor to the button's top instead
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
        right: window.innerWidth - rect.right,
        zIndex: 9999,
      });
    }
    setOpen((v) => !v);
  }

  function choose(fn: () => void) {
    setOpen(false);
    fn();
  }

  const menu = open && mounted ? createPortal(
    <>
      {/* Invisible full-screen backdrop to catch outside clicks */}
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
      <div
        style={menuStyle}
        className="min-w-[160px] rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl"
      >
        <button
          onClick={() => choose(onApprove)}
          disabled={currentStatus === "APPROVED"}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
        </button>
        <button
          onClick={() => choose(onReject)}
          disabled={currentStatus === "REJECTED"}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <XCircle className="h-3.5 w-3.5" /> Reject
        </button>
        <div className="my-1 border-t border-zinc-800" />
        <button
          onClick={() => choose(onPending)}
          disabled={currentStatus === "PENDING"}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Clock className="h-3.5 w-3.5" /> Reset to pending
        </button>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={isTransitioning}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        <StatusPill status={currentStatus} />
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>

      {menu}
    </div>
  );
}

// ── Creators table ────────────────────────────────────────────────────────────

function CreatorsTable({ initial }: { initial: PendingCreator[] }) {
  const [creators, setCreators] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [preview, setPreview] = useState<PendingCreator | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);

  function updateStatus(id: string, status: ModerationStatus) {
    setCreators((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, moderationStatus: status, moderatedAt: status === "PENDING" ? null : new Date() }
          : c,
      ),
    );
  }

  function handleConfirm(note: string) {
    if (!dialog) return;
    const { type, id } = dialog;
    setDialog(null);
    startTransition(async () => {
      if (type === "approve") {
        await approveCreator(id);
        updateStatus(id, "APPROVED");
      } else {
        await rejectCreator(id, note || undefined);
        updateStatus(id, "REJECTED");
      }
    });
  }

  const filtered = creators.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.user.name?.toLowerCase().includes(q)) ||
      c.user.email.toLowerCase().includes(q) ||
      (c.niche?.toLowerCase().includes(q))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dateA = new Date(a.user.createdAt).getTime();
    const dateB = new Date(b.user.createdAt).getTime();
    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  const allSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const selectedInView = sorted.filter((c) => selected.has(c.id));
  const selectedCount = selectedInView.length;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        sorted.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        sorted.forEach((c) => next.add(c.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkConfirm(note: string) {
    if (!bulkAction) return;
    const action = bulkAction;
    const ids = selectedInView.map((c) => c.id);
    setBulkAction(null);
    setSelected(new Set());
    startTransition(async () => {
      for (const id of ids) {
        if (action === "approve") {
          await approveCreator(id);
          updateStatus(id, "APPROVED");
        } else {
          await rejectCreator(id, note || undefined);
          updateStatus(id, "REJECTED");
        }
      }
    });
  }

  return (
    <>
      {preview && (
        <CreatorPreviewModal creator={preview} onClose={() => setPreview(null)} />
      )}

      {dialog && (
        <ConfirmDialog
          open
          title={
            dialog.type === "approve"
              ? `Approve "${dialog.label}"?`
              : `Reject "${dialog.label}"?`
          }
          description={
            dialog.type === "approve"
              ? "This creator will become publicly visible on the Discover page and receive a notification."
              : "This creator will be hidden from all public pages and receive a notification."
          }
          confirmLabel={dialog.type === "approve" ? "Approve" : "Reject"}
          confirmClass={
            dialog.type === "approve"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-red-600 hover:bg-red-500"
          }
          showNote={dialog.type === "reject"}
          onConfirm={handleConfirm}
          onCancel={() => setDialog(null)}
        />
      )}

      {bulkAction && (
        <ConfirmDialog
          open
          title={
            bulkAction === "approve"
              ? `Approve ${selectedCount} creator${selectedCount !== 1 ? "s" : ""}?`
              : `Reject ${selectedCount} creator${selectedCount !== 1 ? "s" : ""}?`
          }
          description={
            bulkAction === "approve"
              ? "All selected creators will become publicly visible and receive a notification."
              : "All selected creators will be hidden from public pages and receive a notification."
          }
          confirmLabel={bulkAction === "approve" ? "Approve All" : "Reject All"}
          confirmClass={
            bulkAction === "approve"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-red-600 hover:bg-red-500"
          }
          showNote={bulkAction === "reject"}
          onConfirm={handleBulkConfirm}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, email, or niche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5">
              <span className="text-xs font-medium text-zinc-400">{selectedCount} selected</span>
              <div className="h-3.5 w-px bg-zinc-700" />
              <button
                onClick={() => setBulkAction("approve")}
                disabled={isPending}
                className="text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setBulkAction("reject")}
                disabled={isPending}
                className="text-xs font-medium text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => {
                  const ids = selectedInView.map((c) => c.id);
                  setSelected(new Set());
                  startTransition(async () => {
                    for (const id of ids) {
                      await setPendingCreator(id);
                      updateStatus(id, "PENDING");
                    }
                  });
                }}
                disabled={isPending}
                className="text-xs font-medium text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-50"
              >
                Reset Pending
              </button>
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {sortOrder === "newest" ? (
                <ArrowDown className="h-3.5 w-3.5 text-zinc-400" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 text-zinc-400" />
              )}
              {sortOrder === "newest" ? "Newest first" : "Oldest first"}
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[170px] rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl">
                  <button
                    onClick={() => { setSortOrder("newest"); setSortOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-900 ${sortOrder === "newest" ? "text-violet-400" : "text-zinc-300"}`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Newest to Oldest
                  </button>
                  <button
                    onClick={() => { setSortOrder("oldest"); setSortOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-900 ${sortOrder === "oldest" ? "text-violet-400" : "text-zinc-300"}`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Oldest to Newest
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="w-10 px-5 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && selectedCount > 0; }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-violet-500"
                />
              </th>
              <th className="px-5 py-3.5">Creator</th>
              <th className="px-5 py-3.5">Niche</th>
              <th className="px-5 py-3.5">Followers</th>
              <th className="px-5 py-3.5">Location</th>
              <th className="px-5 py-3.5">Joined</th>
              <th className="px-5 py-3.5">Note</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-zinc-500">
                  {search ? "No creators match your search." : "No creators found."}
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr
                key={c.id}
                className={`transition-colors hover:bg-zinc-900/60 ${selected.has(c.id) ? "bg-violet-500/5" : ""} ${
                  c.moderationStatus !== "PENDING" ? "opacity-70" : ""
                }`}
              >
                <td className="px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-violet-500"
                  />
                </td>
                {/* Creator */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {c.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.user.image}
                        alt={c.user.name ?? ""}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
                        <User className="h-4 w-4 text-zinc-500" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-zinc-200">{c.user.name ?? "—"}</p>
                        {c.moderationStatus === "APPROVED" && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-label="Verified" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">{c.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-zinc-400">{c.niche ?? "—"}</td>
                <td className="px-5 py-3.5 text-zinc-300">{c.totalFollowers.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-zinc-400">{c.location ?? "—"}</td>
                <td className="px-5 py-3.5 text-zinc-500">
                  {new Date(c.user.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                {/* Moderation note */}
                <td className="max-w-[160px] px-5 py-3.5">
                  {c.moderationNote ? (
                    <span className="line-clamp-2 text-xs italic text-zinc-400">{c.moderationNote}</span>
                  ) : (
                    <span className="text-zinc-700">—</span>
                  )}
                </td>
                {/* Actions */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview(c)}
                      title="Preview creator profile"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-400"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </button>
                    <StatusDropdown
                      currentStatus={c.moderationStatus}
                      isPending={isPending}
                      onApprove={() =>
                        setDialog({ type: "approve", id: c.id, label: c.user.name ?? "Creator", kind: "creator" })
                      }
                      onReject={() =>
                        setDialog({ type: "reject", id: c.id, label: c.user.name ?? "Creator", kind: "creator" })
                      }
                      onPending={() => {
                        startTransition(async () => {
                          await setPendingCreator(c.id);
                          updateStatus(c.id, "PENDING");
                        });
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Campaigns table ───────────────────────────────────────────────────────────

function CampaignsTable({ initial }: { initial: PendingCampaign[] }) {
  const [campaigns, setCampaigns] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [preview, setPreview] = useState<PendingCampaign | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);

  function updateStatus(id: string, status: ModerationStatus) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, moderationStatus: status, moderatedAt: status === "PENDING" ? null : new Date() }
          : c,
      ),
    );
  }

  function handleConfirm(note: string) {
    if (!dialog) return;
    const { type, id } = dialog;
    setDialog(null);
    startTransition(async () => {
      if (type === "approve") {
        await approveCampaign(id);
        updateStatus(id, "APPROVED");
      } else {
        await rejectCampaign(id, note || undefined);
        updateStatus(id, "REJECTED");
      }
    });
  }

  const filtered = campaigns.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.brand.companyName.toLowerCase().includes(q) ||
      (c.brand.industry?.toLowerCase().includes(q))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  const allSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const selectedInView = sorted.filter((c) => selected.has(c.id));
  const selectedCount = selectedInView.length;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        sorted.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        sorted.forEach((c) => next.add(c.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkConfirm(note: string) {
    if (!bulkAction) return;
    const action = bulkAction;
    const ids = selectedInView.map((c) => c.id);
    setBulkAction(null);
    setSelected(new Set());
    startTransition(async () => {
      for (const id of ids) {
        if (action === "approve") {
          await approveCampaign(id);
          updateStatus(id, "APPROVED");
        } else {
          await rejectCampaign(id, note || undefined);
          updateStatus(id, "REJECTED");
        }
      }
    });
  }

  return (
    <>
      {preview && (
        <CampaignPreviewModal campaign={preview} onClose={() => setPreview(null)} />
      )}

      {dialog && (
        <ConfirmDialog
          open
          title={
            dialog.type === "approve"
              ? `Approve "${dialog.label}"?`
              : `Reject "${dialog.label}"?`
          }
          description={
            dialog.type === "approve"
              ? "This campaign will become publicly visible to creators. The brand will receive a notification."
              : "This campaign will be hidden from all public pages. The brand will receive a notification."
          }
          confirmLabel={dialog.type === "approve" ? "Approve" : "Reject"}
          confirmClass={
            dialog.type === "approve"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-red-600 hover:bg-red-500"
          }
          showNote={dialog.type === "reject"}
          onConfirm={handleConfirm}
          onCancel={() => setDialog(null)}
        />
      )}

      {bulkAction && (
        <ConfirmDialog
          open
          title={
            bulkAction === "approve"
              ? `Approve ${selectedCount} campaign${selectedCount !== 1 ? "s" : ""}?`
              : `Reject ${selectedCount} campaign${selectedCount !== 1 ? "s" : ""}?`
          }
          description={
            bulkAction === "approve"
              ? "All selected campaigns will become publicly visible. The brands will receive a notification."
              : "All selected campaigns will be hidden from public pages. The brands will receive a notification."
          }
          confirmLabel={bulkAction === "approve" ? "Approve All" : "Reject All"}
          confirmClass={
            bulkAction === "approve"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-red-600 hover:bg-red-500"
          }
          showNote={bulkAction === "reject"}
          onConfirm={handleBulkConfirm}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by title, brand, or industry…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5">
              <span className="text-xs font-medium text-zinc-400">{selectedCount} selected</span>
              <div className="h-3.5 w-px bg-zinc-700" />
              <button
                onClick={() => setBulkAction("approve")}
                disabled={isPending}
                className="text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setBulkAction("reject")}
                disabled={isPending}
                className="text-xs font-medium text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => {
                  const ids = selectedInView.map((c) => c.id);
                  setSelected(new Set());
                  startTransition(async () => {
                    for (const id of ids) {
                      await setPendingCampaign(id);
                      updateStatus(id, "PENDING");
                    }
                  });
                }}
                disabled={isPending}
                className="text-xs font-medium text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-50"
              >
                Reset Pending
              </button>
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {sortOrder === "newest" ? (
                <ArrowDown className="h-3.5 w-3.5 text-zinc-400" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 text-zinc-400" />
              )}
              {sortOrder === "newest" ? "Newest first" : "Oldest first"}
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[170px] rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-2xl">
                  <button
                    onClick={() => { setSortOrder("newest"); setSortOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-900 ${sortOrder === "newest" ? "text-violet-400" : "text-zinc-300"}`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Newest to Oldest
                  </button>
                  <button
                    onClick={() => { setSortOrder("oldest"); setSortOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-900 ${sortOrder === "oldest" ? "text-violet-400" : "text-zinc-300"}`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Oldest to Newest
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="w-10 px-5 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && selectedCount > 0; }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-violet-500"
                />
              </th>
              <th className="px-5 py-3.5">Campaign</th>
              <th className="px-5 py-3.5">Brand</th>
              <th className="px-5 py-3.5">Budget</th>
              <th className="px-5 py-3.5">Campaign status</th>
              <th className="px-5 py-3.5">Created</th>
              <th className="px-5 py-3.5">Note</th>
              <th className="px-5 py-3.5">Moderation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-zinc-500">
                  {search ? "No campaigns match your search." : "No campaigns found."}
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr
                key={c.id}
                className={`transition-colors hover:bg-zinc-900/60 ${selected.has(c.id) ? "bg-violet-500/5" : ""} ${
                  c.moderationStatus !== "PENDING" ? "opacity-70" : ""
                }`}
              >
                <td className="px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-violet-500"
                  />
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-zinc-200">{c.title}</p>
                  <p className="mt-0.5 max-w-xs truncate text-xs text-zinc-500">{c.description}</p>
                </td>
                <td className="px-5 py-3.5 text-zinc-400">{c.brand.companyName}</td>
                <td className="px-5 py-3.5 text-zinc-300">${c.budget.toLocaleString()}</td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex rounded-full bg-zinc-700/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
                    {c.status.charAt(0) + c.status.slice(1).toLowerCase().replace("_", " ")}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-zinc-500">
                  {new Date(c.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="max-w-[160px] px-5 py-3.5">
                  {c.moderationNote ? (
                    <span className="line-clamp-2 text-xs italic text-zinc-400">{c.moderationNote}</span>
                  ) : (
                    <span className="text-zinc-700">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview(c)}
                      title="Preview campaign details"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </button>
                    <StatusDropdown
                      currentStatus={c.moderationStatus}
                      isPending={isPending}
                      onApprove={() =>
                        setDialog({ type: "approve", id: c.id, label: c.title, kind: "campaign" })
                      }
                      onReject={() =>
                        setDialog({ type: "reject", id: c.id, label: c.title, kind: "campaign" })
                      }
                      onPending={() => {
                        startTransition(async () => {
                          await setPendingCampaign(c.id);
                          updateStatus(c.id, "PENDING");
                        });
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-100">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ModerationClient({
  creators,
  campaigns,
}: {
  creators: PendingCreator[];
  campaigns: PendingCampaign[];
}) {
  const [tab, setTab] = useState<"creators" | "campaigns">("creators");

  const pendingCreators = creators.filter((c) => c.moderationStatus === "PENDING").length;
  const pendingCampaigns = campaigns.filter((c) => c.moderationStatus === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <AlertCircle className="h-6 w-6 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Moderation</h1>
          <p className="text-sm text-zinc-400">
            Review and manage creator profiles &amp; campaigns — click <span className="font-medium text-zinc-300">View</span> to inspect, then use the status pill to approve or reject
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Pending creators"
          value={pendingCreators}
          color="bg-amber-500/15 text-amber-400"
        />
        <StatCard
          icon={User}
          label="Total creators"
          value={creators.length}
          color="bg-violet-500/15 text-violet-400"
        />
        <StatCard
          icon={Clock}
          label="Pending campaigns"
          value={pendingCampaigns}
          color="bg-amber-500/15 text-amber-400"
        />
        <StatCard
          icon={Megaphone}
          label="Total campaigns"
          value={campaigns.length}
          color="bg-blue-500/15 text-blue-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
        {(["creators", "campaigns"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-violet-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t}
            {t === "creators" && pendingCreators > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-black">
                {pendingCreators}
              </span>
            )}
            {t === "campaigns" && pendingCampaigns > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-black">
                {pendingCampaigns}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tables */}
      {tab === "creators" ? (
        <CreatorsTable initial={creators} />
      ) : (
        <CampaignsTable initial={campaigns} />
      )}
    </div>
  );
}
