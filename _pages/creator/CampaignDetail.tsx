"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, DollarSign, Clock, MapPin,
  Send, CheckCircle2, X, Loader2, MessageSquare, CalendarDays,
  SlidersHorizontal, FileText, Users, ExternalLink,
  Star, Megaphone, AlertTriangle, XCircle,
} from "lucide-react";
import { ReportButton } from "@/app/_components/report/ReportModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MainLayout from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import { useMessaging, type ConversationRecipient } from "@/app/_components/messaging/MessagingContext";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  getPublicCampaignDetailAction,
  applyToCampaignAction,
  withdrawApplicationAction,
  respondToCampaignAction,
  type PublicCampaignDetail,
} from "@/app/actions/creator-campaigns";
import {
  type DBMessage,
  getConversationAction,
  sendMessageAction,
} from "@/app/actions/messages";
import { SmartCalendarWidget } from "@/components/calendar/SmartCalendarWidget";

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: "📸", tiktok: "🎵", youtube: "▶️",
  twitter: "🐦", linkedin: "💼", pinterest: "📌", twitch: "🎮", snapchat: "👻",
};

const CONTENT_FORMAT_META: Record<string, { label: string; emoji: string }> = {
  story: { label: "Story", emoji: "⏱️" },
  post: { label: "Post", emoji: "🖼️" },
  reel: { label: "Reel", emoji: "🎬" },
  tiktok_video: { label: "TikTok Video", emoji: "🎵" },
  youtube_video: { label: "YouTube Video", emoji: "▶️" },
  storytelling: { label: "Storytelling", emoji: "📖" },
  live: { label: "Live Stream", emoji: "🔴" },
  ugc: { label: "UGC", emoji: "📱" },
};

const APP_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: "Application Pending", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40", icon: Clock },
  UNDER_REVIEW: { label: "Under Review", color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40", icon: SlidersHorizontal },
  ACCEPTED: { label: "Application Accepted! 🎉", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/40", icon: CheckCircle2 },
  REJECTED: { label: "Not Selected", color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40", icon: X },
  WITHDRAWN: { label: "Application Withdrawn", color: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700", icon: X },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBudget(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntil(iso: string | null): { label: string; urgent: boolean } | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: "Expired", urgent: true };
  if (days === 0) return { label: "Expires today", urgent: true };
  if (days === 1) return { label: "1d remaining", urgent: true };
  if (days <= 7) return { label: `${days}d remaining`, urgent: true };
  return { label: `${days}d remaining`, urgent: false };
}

// ── Negotiation Terms Section ─────────────────────────────────────────────────

function NegotiationStatus({ campaign }: { campaign: PublicCampaignDetail }) {
  const status = campaign.applicationStatus;
  if (!status) return null;

  const cfg = APP_STATUS_CONFIG[status] ?? APP_STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;

  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5 mb-5", cfg.color.split(" ").filter(c => c.startsWith("border") || c.startsWith("bg")).join(" "))}>
      <div className={cn("flex items-center gap-2 font-semibold text-sm mb-2", cfg.color.split(" ").filter(c => !c.startsWith("border") && !c.startsWith("bg")).join(" "))}>
        <Icon className="w-4 h-4" />
        {cfg.label}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {campaign.negotiatedRate && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Agreed Rate</p>
            <p className="font-bold text-base">${campaign.negotiatedRate.toLocaleString()}</p>
          </div>
        )}
        {campaign.applicationContentFormats.length > 0 && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground mb-1.5">Content Formats</p>
            <div className="flex flex-wrap gap-1.5">
              {campaign.applicationContentFormats.map((f) => {
                const meta = CONTENT_FORMAT_META[f];
                return (
                  <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/60 dark:bg-black/20 text-xs font-medium border border-current/20">
                    {meta?.emoji} {meta?.label ?? f}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {campaign.brandNote && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground mb-0.5">Note from Brand</p>
            <p className="text-sm italic">"{campaign.brandNote}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campaign Workflow Progress Banner (for creators) ─────────────────────────

const CREATOR_WORKFLOW_META: Record<string, { label: string; color: string; bg: string; description: string }> = {
  PENDING:     { label: "Pending",     color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  description: "The brand is reviewing applicants" },
  ACCEPTED:    { label: "Accepted",    color: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  description: "Your collaboration has been accepted!" },
  IN_PROGRESS: { label: "In Progress", color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  description: "Content creation is underway" },
  SUBMITTED:   { label: "Submitted",   color: "#06b6d4", bg: "rgba(6,182,212,0.08)",   description: "Deliverables submitted — awaiting brand approval" },
  COMPLETED:   { label: "Completed",   color: "#10b981", bg: "rgba(16,185,129,0.08)",  description: "Campaign completed successfully 🎉" },
};

const WORKFLOW_STEPS = ["PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "COMPLETED"] as const;

function CampaignProgressBanner({ status }: { status: string }) {
  const meta = CREATOR_WORKFLOW_META[status];
  if (!meta) return null;

  const currentIdx = WORKFLOW_STEPS.indexOf(status as typeof WORKFLOW_STEPS[number]);

  return (
    <div
      className="rounded-2xl p-4 mb-5 border"
      style={{ background: meta.bg, borderColor: `${meta.color}30` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: meta.color }}>
            Campaign Progress
          </p>
          <p className="text-sm text-zinc-300">{meta.description}</p>
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
          style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}30` }}
        >
          {meta.label}
        </span>
      </div>

      {/* Mini stepper */}
      <div className="flex items-center gap-0 overflow-x-auto">
        {WORKFLOW_STEPS.map((step, idx) => {
          const stepMeta = CREATOR_WORKFLOW_META[step];
          const isDone = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          return (
            <div key={step} className="flex items-center shrink-0">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{
                    background: isDone ? "#10b981" : isCurrent ? stepMeta.color : "rgba(113,113,122,0.2)",
                    color: isDone || isCurrent ? "#fff" : "#52525b",
                  }}
                >
                  {isDone ? "✓" : idx + 1}
                </div>
                <span className="text-[8px] whitespace-nowrap" style={{ color: isCurrent ? stepMeta.color : isDone ? "#10b981" : "#52525b" }}>
                  {stepMeta.label}
                </span>
              </div>
              {idx < WORKFLOW_STEPS.length - 1 && (
                <div
                  className="w-6 sm:w-10 h-px mx-0.5 mb-3"
                  style={{ background: isDone ? "#10b98150" : "rgba(113,113,122,0.2)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Action Required ───────────────────────────────────────────────────────────

function ActionRequired({
  campaign,
  onResponded,
}: {
  campaign: PublicCampaignDetail;
  onResponded: (newStatus: string) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const handleAccept = () => {
    startTransition(async () => {
      const result = await respondToCampaignAction(campaign.id, "ACCEPTED");
      if (result.error) {
        toast({ variant: "destructive", title: result.error });
        return;
      }
      toast({ title: "You've accepted the campaign! 🎉 The brand has been notified." });
      onResponded("ACCEPTED");
    });
  };

  const handleDecline = () => {
    startTransition(async () => {
      const result = await respondToCampaignAction(campaign.id, "DECLINED", declineReason);
      if (result.error) {
        toast({ variant: "destructive", title: result.error });
        return;
      }
      toast({ title: "You've declined the campaign. The brand has been notified." });
      onResponded("ACTIVE");
    });
  };

  return (
    <div className="rounded-2xl border-2 border-amber-400/60 dark:border-amber-500/40 bg-amber-50/80 dark:bg-amber-900/10 p-5 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="font-bold text-base text-amber-800 dark:text-amber-300">Action Required</h3>
          <p className="text-sm text-amber-700/80 dark:text-amber-400/80 mt-0.5">
            The brand has started the campaign workflow. Please review the campaign details and confirm your participation.
          </p>
        </div>
      </div>

      {!showDeclineForm ? (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            onClick={handleAccept}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Accept Campaign
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-red-300 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold"
            onClick={() => setShowDeclineForm(true)}
            disabled={isPending}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Decline
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Reason for declining <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Let the brand know why you're declining…"
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-right mt-0.5">{declineReason.length}/500</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setShowDeclineForm(false); setDeclineReason(""); }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold"
              onClick={handleDecline}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Decline
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart Calendar ─────────────────────────────────────────────────────────────

function CampaignSmartCalendar({ campaignId }: { campaignId: string }) {
  return (
    <div className="space-y-2">
      <SmartCalendarWidget campaignId={campaignId} />
    </div>
  );
}

// ── Inline Campaign Chat ───────────────────────────────────────────────────────

function formatChatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function CampaignChat({
  brandUserId,
  brandName,
  brandAvatarUrl,
  currentUserId,
}: {
  brandUserId: string;
  brandName: string;
  brandAvatarUrl: string | null;
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConversationAction(brandUserId).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
  }, [brandUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    const result = await sendMessageAction(brandUserId, trimmed);
    if (result.error) {
      toast({ variant: "destructive", title: result.error });
      setText(trimmed);
    } else {
      const optimistic: DBMessage = {
        id: `opt-${Date.now()}`,
        text: trimmed,
        senderId: currentUserId,
        receiverId: brandUserId,
        createdAt: new Date().toISOString(),
        senderRole: "creator",
        senderName: "You",
        senderAvatarUrl: null,
      };
      setMessages((prev) => [...prev, optimistic]);
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 justify-between">
        <p className="text-xs text-muted-foreground">
          Direct business communication with <span className="font-medium text-foreground">{brandName}</span>
        </p>
      </div>

      {/* Messages area */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col gap-2 p-3 min-h-[200px] max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Start the conversation with the brand</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={cn("flex gap-2 items-end", isMe ? "flex-row-reverse" : "flex-row")}>
                {!isMe && (
                  <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-zinc-200 dark:bg-zinc-700">
                    {brandAvatarUrl ? (
                      <img src={brandAvatarUrl} alt={brandName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-zinc-500">
                        {brandName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
                <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isMe ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "px-3 py-2 rounded-2xl text-sm leading-snug",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-white dark:bg-zinc-800 text-foreground border border-zinc-200 dark:border-zinc-700 rounded-bl-sm",
                    )}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">{formatChatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={`Message ${brandName}…`}
          className="flex-1 text-sm"
        />
        <Button
          onClick={() => void handleSend()}
          disabled={!text.trim() || sending}
          size="icon"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ── Apply / Negotiate Form ─────────────────────────────────────────────────────

function ApplyForm({
  campaign,
  currentUserId,
  onApplied,
  onWithdraw,
}: {
  campaign: PublicCampaignDetail;
  currentUserId: string | null;
  onApplied: (appId: string) => void;
  onWithdraw: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isWithdrawing, startWithdraw] = useTransition();
  const [rate, setRate] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [tab, setTab] = useState<"apply" | "messages" | "calendar">(
    campaign.applicationStatus ? "apply" : "apply",
  );

  const canApply = !campaign.applicationStatus;
  const canWithdraw = campaign.applicationStatus === "PENDING";

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
        coverLetter: coverLetter.trim() || undefined,
      });
      if (result.error || !result.data) {
        toast({ variant: "destructive", title: result.error ?? "Failed to apply." });
        return;
      }
      toast({ title: "Application submitted! 🎉" });
      onApplied(result.data.id);
    });
  };

  const handleWithdraw = () => {
    if (!campaign.applicationId) return;
    startWithdraw(async () => {
      const result = await withdrawApplicationAction(campaign.applicationId!);
      if (result.error) {
        toast({ variant: "destructive", title: result.error });
        return;
      }
      toast({ title: "Application withdrawn." });
      onWithdraw();
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {[
          { key: "apply", label: canApply ? "Apply & Negotiate" : "Your Application", icon: Send },
          { key: "messages", label: "Messages", icon: MessageSquare },
          { key: "calendar", label: "Calendar", icon: CalendarDays },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as "apply" | "calendar")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors flex-1 justify-center",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {tab === "apply" && (
          <>
            {canApply ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Your Rate (USD) *</label>
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
                  <p className="text-xs text-muted-foreground mt-1">Campaign budget: {formatBudget(campaign.budget)}</p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Cover Letter (optional)</label>
                  <textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Tell the brand why you're a great fit. Mention your audience, niche, past work…"
                    rows={4}
                    maxLength={1000}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right mt-0.5">{coverLetter.length}/1000</p>
                </div>

                <Button type="submit" disabled={isPending} className="w-full">
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Submit Application
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Status: <span className="font-semibold text-foreground">{APP_STATUS_CONFIG[campaign.applicationStatus!]?.label ?? campaign.applicationStatus}</span>
                </div>

                {campaign.negotiatedRate && (
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Agreed Rate</p>
                      <p className="font-bold text-lg">${campaign.negotiatedRate.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {campaign.applicationContentFormats.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Agreed Content Formats</p>
                    <div className="flex flex-wrap gap-2">
                      {campaign.applicationContentFormats.map((f) => {
                        const meta = CONTENT_FORMAT_META[f];
                        return (
                          <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {meta?.emoji} {meta?.label ?? f}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {campaign.brandNote && (
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border p-3 text-sm text-muted-foreground italic">
                    "{campaign.brandNote}"
                  </div>
                )}

                {canWithdraw && (
                  <Button
                    variant="outline"
                    className="w-full text-muted-foreground hover:text-red-500 hover:border-red-300"
                    onClick={handleWithdraw}
                    disabled={isWithdrawing}
                  >
                    {isWithdrawing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                    Withdraw Application
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {tab === "messages" && (
          currentUserId ? (
            <CampaignChat
              brandUserId={campaign.brand.userId}
              brandName={campaign.brand.companyName}
              brandAvatarUrl={campaign.brand.avatarUrl}
              currentUserId={currentUserId}
            />
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">Sign in to message the brand.</div>
          )
        )}

        {tab === "calendar" && (
          <CampaignSmartCalendar campaignId={campaign.id} />
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const CreatorCampaignDetail = () => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { openChatWindow } = useMessaging();
  const { profile } = useAuth();

  const [campaign, setCampaign] = useState<PublicCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    const result = await getPublicCampaignDetailAction(params.id);
    if (result.error) {
      toast({ variant: "destructive", title: result.error });
    } else {
      setCampaign(result.data);
    }
    setLoading(false);
  }, [params.id, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3" />
          <div className="h-48 bg-zinc-200 dark:bg-zinc-700 rounded-2xl" />
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3" />
        </div>
      </MainLayout>
    );
  }

  if (!campaign) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <Megaphone className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <h2 className="font-bold text-xl mb-2">Campaign not found</h2>
          <Button variant="outline" onClick={() => router.push("/creator/campaigns")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Campaigns
          </Button>
        </div>
      </MainLayout>
    );
  }

  const deadline = daysUntil(campaign.deadline);

  const handleMessageBrand = () => {
    const recipient: ConversationRecipient = {
      id: campaign.brand.userId,
      full_name: campaign.brand.companyName,
      avatar_url: campaign.brand.avatarUrl,
      user_type: "brand",
    };
    openChatWindow(recipient);
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Back */}
        <Link
          href="/creator/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> All Campaigns
        </Link>

        {/* Hero image */}
        {campaign.imageUrl && (
          <div className="w-full h-52 sm:h-64 rounded-2xl overflow-hidden mb-5">
            <img src={campaign.imageUrl} alt={campaign.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Title + meta */}
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{campaign.title}</h1>

          {/* Brand row */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <Link
              href={`/profile/${campaign.brand.userId}`}
              className="flex items-center gap-2 group"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 shrink-0">
                {campaign.brand.avatarUrl ? (
                  <img src={campaign.brand.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                    {campaign.brand.companyName[0]}
                  </div>
                )}
              </div>
              <div className="text-sm">
                <span className="font-semibold group-hover:text-primary transition-colors">{campaign.brand.companyName}</span>
                {campaign.brand.industry && <span className="text-muted-foreground"> · {campaign.brand.industry}</span>}
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>

            <Button
              size="sm"
              variant="outline"
              className="ml-auto flex items-center gap-1.5"
              onClick={handleMessageBrand}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Message Brand
            </Button>
            {campaign && (
              <ReportButton
                targetCampaign={{ id: campaign.id, title: campaign.title }}
                variant="icon"
                className="ml-1 h-8 w-8 rounded-lg border-zinc-200 dark:border-zinc-700"
              />
            )}
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              {formatBudget(campaign.budget)} budget
            </span>
            {deadline && (
              <span className={cn("flex items-center gap-1.5", deadline.urgent ? "text-red-500" : "text-muted-foreground")}>
                <Clock className="w-4 h-4" />
                {deadline.label}
              </span>
            )}
            {campaign.brand.location && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                {campaign.brand.location}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-4 h-4" />
              {campaign.totalApplications} applicant{campaign.totalApplications !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Application status banner */}
        {campaign.applicationStatus && (
          <NegotiationStatus campaign={campaign} />
        )}

        {/* Campaign workflow progress — visible when brand set a workflow status */}
        <CampaignProgressBanner status={campaign.status} />

        {/* Action Required — shown when brand started workflow & creator was accepted */}
        {campaign.status === "PENDING" && campaign.applicationStatus === "ACCEPTED" && (
          <ActionRequired
            campaign={campaign}
            onResponded={(newStatus) => {
              setCampaign((prev) => prev ? { ...prev, status: newStatus } : prev);
            }}
          />
        )}

        {/* About / Description */}
        <section className="mb-5">
          <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            About this Campaign
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{campaign.description}</p>
        </section>

        {/* Collaboration Brief */}
        {(campaign.briefDescription || campaign.goal || campaign.dosAndDonts) && (
          <section className="mb-5 rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-white/[0.05]">
              <h2 className="text-sm font-semibold">Collaboration Brief</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Guidelines shared by the brand</p>
            </div>
            <div className="px-5 py-4 space-y-5">
              {campaign.briefDescription && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <span className="w-4 h-4 inline-flex items-center justify-center text-base leading-none">📋</span>
                    Brief Description
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{campaign.briefDescription}</p>
                </div>
              )}
              {campaign.goal && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <span className="w-4 h-4 inline-flex items-center justify-center text-base leading-none">🎯</span>
                    Campaign Goal
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{campaign.goal}</p>
                </div>
              )}
              {campaign.dosAndDonts && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <span className="w-4 h-4 inline-flex items-center justify-center text-base leading-none">✅</span>
                    Do&apos;s &amp; Don&apos;ts
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{campaign.dosAndDonts}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Requirements */}
        {campaign.requirements && (
          <section className="mb-5 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40 p-4">
            <h3 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
              <Star className="w-4 h-4" />
              Requirements
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{campaign.requirements}</p>
          </section>
        )}

        {/* Platforms */}
        {campaign.platforms.length > 0 && (
          <section className="mb-5">
            <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">Platforms</h3>
            <div className="flex flex-wrap gap-2">
              {campaign.platforms.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium capitalize">
                  {PLATFORM_EMOJI[p] ?? "🌐"} {p}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Content formats */}
        {campaign.contentFormats.length > 0 && (
          <section className="mb-5">
            <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">Content Formats</h3>
            <div className="flex flex-wrap gap-2">
              {campaign.contentFormats.map((f) => {
                const meta = CONTENT_FORMAT_META[f];
                return (
                  <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                    {meta?.emoji} {meta?.label ?? f}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* Apply & Negotiate section */}
        <section>
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            {campaign.applicationStatus ? "Negotiation & Terms" : "Apply & Negotiate"}
          </h2>
          <ApplyForm
            campaign={campaign}
            currentUserId={profile?.user_id ?? null}
            onApplied={(appId) => {
              setCampaign((prev) => prev ? { ...prev, applicationStatus: "PENDING", applicationId: appId } : prev);
            }}
            onWithdraw={() => {
              setCampaign((prev) => prev ? { ...prev, applicationStatus: "WITHDRAWN" } : prev);
            }}
          />
        </section>
      </div>

    </MainLayout>
  );
};

export default CreatorCampaignDetail;
