"use client";

import { useState, useTransition } from "react";
import {
  Scale,
  Eye,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  MessageSquare,
  User,
  Building2,
  Megaphone,
  ChevronDown,
  Send,
  Loader2,
  Calendar,
  FileText,
  Flag,
} from "lucide-react";
import {
  updateDisputeStatus,
  resolveDispute,
  closeDispute,
  getDisputeMessages,
  type DisputeStatusValue,
} from "@/app/admin/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserSnap = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
} | null;

export interface DisputeRow {
  id: string;
  status: DisputeStatusValue;
  reason: string;
  description: string;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  campaign: { id: string; title: string } | null;
  // user-submitted report parties
  reporter: UserSnap;
  targetUser: UserSnap;
  // legacy admin-assigned parties
  brand: UserSnap;
  creator: UserSnap;
}

type DisputeMessage = {
  id: string;
  text: string;
  createdAt: Date;
  senderId: string;
  sender: { name: string | null; image: string | null };
};

type StatusFilter = DisputeStatusValue | "ALL";

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_META: Record<
  DisputeStatusValue,
  { label: string; icon: React.ElementType; classes: string }
> = {
  OPEN: {
    label: "Open",
    icon: AlertTriangle,
    classes: "bg-amber-500/15 text-amber-400",
  },
  IN_REVIEW: {
    label: "In Review",
    icon: Clock,
    classes: "bg-blue-500/15 text-blue-400",
  },
  RESOLVED: {
    label: "Resolved",
    icon: CheckCircle2,
    classes: "bg-emerald-500/15 text-emerald-400",
  },
  CLOSED: {
    label: "Closed",
    icon: XCircle,
    classes: "bg-zinc-500/20 text-zinc-400",
  },
};

function StatusPill({ status }: { status: DisputeStatusValue }) {
  const { label, icon: Icon, classes } = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

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

// ── Reason label helpers ──────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  SCAM_FRAUD: "Scam / Fraud",
  INAPPROPRIATE_CONTENT: "Inappropriate Content",
  UNPROFESSIONAL_BEHAVIOR: "Unprofessional Behavior",
  SPAM: "Spam",
  OTHER: "Other",
};

function reasonLabel(r: string) {
  return REASON_LABELS[r] ?? r.replace(/_/g, " ");
}

// ── User avatar chip ──────────────────────────────────────────────────────────

function UserChip({
  user,
  fallbackIcon: Icon,
  label,
}: {
  user: UserSnap;
  fallbackIcon: React.ElementType;
  label?: string;
}) {
  if (!user) {
    return <span className="text-xs text-zinc-600">—</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt={user.name ?? ""} className="h-7 w-7 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800">
          <Icon className="h-3.5 w-3.5 text-zinc-500" />
        </div>
      )}
      <div className="min-w-0">
        {label && <p className="text-[10px] uppercase tracking-wider text-zinc-600 leading-none mb-0.5">{label}</p>}
        <p className="truncate text-xs font-medium text-zinc-200">{user.name ?? "—"}</p>
        <p className="truncate text-[10px] text-zinc-500">{user.email}</p>
      </div>
    </div>
  );
}

/** Pick which users to display as "from" and "to" depending on whether this is a
 *  user-submitted report or a legacy admin dispute. */
function resolveParties(d: DisputeRow) {
  const isUserReport = !!d.reporter;
  return {
    isUserReport,
    from: isUserReport ? d.reporter : d.brand,
    to: isUserReport ? d.targetUser : d.creator,
    fromLabel: isUserReport ? "Reporter" : "Brand",
    toLabel: isUserReport ? "Reported user" : "Creator",
    fromIcon: isUserReport ? (d.reporter?.role === "BRAND" ? Building2 : User) : Building2,
    toIcon: isUserReport ? (d.targetUser?.role === "BRAND" ? Building2 : User) : User,
  };
}

// ── Communication panel (messages between the two parties) ────────────────────

function CommunicationPanel({
  brandId,
  creatorId,
}: {
  brandId: string;
  creatorId: string;
}) {
  const [messages, setMessages] = useState<DisputeMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await getDisputeMessages(brandId, creatorId);
    if (result.success) {
      setMessages(result.data);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  if (messages === null) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-300">Communication Audit</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            Load messages
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Click to load all direct messages exchanged between the brand and creator for audit context.
        </p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-300">Communication Audit</p>
        </div>
        <p className="text-xs text-zinc-500">No direct messages found between these parties.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-300">Communication Audit</p>
        </div>
        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
          {messages.length} messages
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isBrand = msg.senderId === brandId;
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isBrand ? "" : "flex-row-reverse"}`}
            >
              {msg.sender.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.sender.image}
                  alt={msg.sender.name ?? ""}
                  className="h-6 w-6 shrink-0 rounded-full object-cover mt-0.5"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-700 mt-0.5">
                  {isBrand ? (
                    <Building2 className="h-3 w-3 text-zinc-400" />
                  ) : (
                    <User className="h-3 w-3 text-zinc-400" />
                  )}
                </div>
              )}
              <div className={`max-w-[70%] ${isBrand ? "" : "items-end flex flex-col"}`}>
                <div
                  className={`rounded-2xl px-3 py-2 text-xs text-zinc-200 ${
                    isBrand
                      ? "rounded-tl-sm bg-zinc-800"
                      : "rounded-tr-sm bg-violet-600/30"
                  }`}
                >
                  {msg.text}
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {msg.sender.name ?? "Unknown"} ·{" "}
                  {new Date(msg.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Action Panel inside modal ─────────────────────────────────────────────────

function ActionPanel({
  dispute,
  onStatusChange,
}: {
  dispute: DisputeRow;
  onStatusChange: (id: string, status: DisputeStatusValue, notes?: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showResolve, setShowResolve] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [notes, setNotes] = useState(dispute.resolutionNotes ?? "");

  function handleQuickStatus(status: DisputeStatusValue) {
    startTransition(async () => {
      await updateDisputeStatus(dispute.id, status);
      onStatusChange(dispute.id, status);
    });
  }

  function handleResolve() {
    startTransition(async () => {
      await resolveDispute(dispute.id, notes || undefined);
      onStatusChange(dispute.id, "RESOLVED", notes || undefined);
      setShowResolve(false);
    });
  }

  function handleClose() {
    startTransition(async () => {
      await closeDispute(dispute.id, notes || undefined);
      onStatusChange(dispute.id, "CLOSED", notes || undefined);
      setShowClose(false);
    });
  }

  return (
    <div className="space-y-4">
      {/* Quick status buttons */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
          Status
        </p>
        <div className="flex flex-wrap gap-2">
          {(["OPEN", "IN_REVIEW"] as DisputeStatusValue[]).map((s) => (
            <button
              key={s}
              onClick={() => handleQuickStatus(s)}
              disabled={isPending || dispute.status === s}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                dispute.status === s
                  ? "border-zinc-600 bg-zinc-800 text-zinc-400"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {isPending && dispute.status !== s ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <StatusPill status={s} />
              )}
            </button>
          ))}
          <button
            onClick={() => { setShowResolve(true); setShowClose(false); }}
            disabled={isPending || dispute.status === "RESOLVED"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-3 w-3" />
            Resolve
          </button>
          <button
            onClick={() => { setShowClose(true); setShowResolve(false); }}
            disabled={isPending || dispute.status === "CLOSED"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle className="h-3 w-3" />
            Close
          </button>
        </div>
      </div>

      {/* Resolution notes */}
      {(showResolve || showClose) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-300">
            {showResolve ? "Resolution" : "Close"} notes (optional)
          </p>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes for both parties…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowResolve(false); setShowClose(false); }}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={showResolve ? handleResolve : handleClose}
              disabled={isPending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                showResolve
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-zinc-700 hover:bg-zinc-600"
              }`}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              {showResolve ? "Mark resolved" : "Close dispute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dispute detail modal ──────────────────────────────────────────────────────

function DisputeModal({
  dispute,
  onClose,
  onStatusChange,
}: {
  dispute: DisputeRow;
  onClose: () => void;
  onStatusChange: (id: string, status: DisputeStatusValue, notes?: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Accent bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-amber-500 to-red-500 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Scale className="h-4 w-4 text-amber-400" />
            <h3 className="font-semibold text-zinc-100">Dispute Detail</h3>
            <StatusPill status={dispute.status} />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Parties */}
          {(() => {
            const { from, to, fromLabel, toLabel, fromIcon, toIcon, isUserReport } = resolveParties(dispute);
            return (
              <div className="space-y-2">
                {isUserReport && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
                    <Flag className="h-3 w-3" />
                    User-submitted report
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
                      {fromLabel}
                    </p>
                    <UserChip user={from} fallbackIcon={fromIcon} />
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
                      {toLabel}
                    </p>
                    <UserChip user={to} fallbackIcon={toIcon} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Campaign link */}
          {dispute.campaign && (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <Megaphone className="h-4 w-4 shrink-0 text-zinc-500" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
                  Related campaign
                </p>
                <p className="text-sm font-medium text-zinc-300">{dispute.campaign.title}</p>
              </div>
            </div>
          )}

          {/* Reason + description */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">
                Reason
              </p>
              <p className="text-sm font-medium text-zinc-200">{reasonLabel(dispute.reason)}</p>
            </div>
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">
                Description
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {dispute.description}
              </p>
            </div>
          </div>

          {/* Existing resolution notes */}
          {dispute.resolutionNotes && (
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-3.5 w-3.5 text-emerald-400" />
                <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-semibold">
                  Admin resolution notes
                </p>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap italic">
                {dispute.resolutionNotes}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-zinc-600">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Opened{" "}
              {new Date(dispute.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Updated{" "}
              {new Date(dispute.updatedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Admin actions */}
          <div className="border-t border-zinc-800 pt-4">
            <ActionPanel dispute={dispute} onStatusChange={onStatusChange} />
          </div>

          {/* Communication audit */}
          {(() => {
            const { from, to } = resolveParties(dispute);
            if (!from || !to) return null;
            return <CommunicationPanel brandId={from.id} creatorId={to.id} />;
          })()}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-3 flex justify-end shrink-0">
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

// ── Status filter tab ─────────────────────────────────────────────────────────

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

// ── Main export ───────────────────────────────────────────────────────────────

export default function DisputesClient({ initial }: { initial: DisputeRow[] }) {
  const [disputes, setDisputes] = useState(initial);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function onStatusChange(id: string, status: DisputeStatusValue, notes?: string) {
    setDisputes((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              status,
              resolutionNotes: notes !== undefined ? notes : d.resolutionNotes,
              updatedAt: new Date(),
            }
          : d,
      ),
    );
    // Update selected modal too
    setSelected((prev) =>
      prev?.id === id
        ? {
            ...prev,
            status,
            resolutionNotes: notes !== undefined ? notes : prev.resolutionNotes,
            updatedAt: new Date(),
          }
        : prev,
    );
  }

  const filtered = disputes
    .filter((d) => filter === "ALL" || d.status === filter)
    .sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "desc" ? -diff : diff;
    });

  const openCount = disputes.filter((d) => d.status === "OPEN").length;
  const inReviewCount = disputes.filter((d) => d.status === "IN_REVIEW").length;
  const resolvedCount = disputes.filter((d) => d.status === "RESOLVED").length;
  const closedCount = disputes.filter((d) => d.status === "CLOSED").length;

  return (
    <>
      {selected && (
        <DisputeModal
          dispute={selected}
          onClose={() => setSelected(null)}
          onStatusChange={onStatusChange}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Scale className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Dispute Resolution</h1>
            <p className="text-sm text-zinc-400">
              Review and resolve disputes between brands and creators. Click{" "}
              <span className="font-medium text-zinc-300">View</span> to inspect, take action, or audit communication.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={AlertTriangle}
            label="Open disputes"
            value={openCount}
            color="bg-amber-500/15 text-amber-400"
          />
          <StatCard
            icon={Clock}
            label="In review"
            value={inReviewCount}
            color="bg-blue-500/15 text-blue-400"
          />
          <StatCard
            icon={CheckCircle2}
            label="Resolved"
            value={resolvedCount}
            color="bg-emerald-500/15 text-emerald-400"
          />
          <StatCard
            icon={XCircle}
            label="Closed"
            value={closedCount}
            color="bg-zinc-500/20 text-zinc-400"
          />
        </div>

        {/* Filter + sort bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status tabs */}
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {FILTER_TABS.map(({ value, label }) => {
              const count =
                value === "ALL"
                  ? disputes.length
                  : disputes.filter((d) => d.status === value).length;
              return (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === value
                      ? "bg-violet-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                  {value === "OPEN" && count > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                      {count}
                    </span>
                  )}
                  {value !== "OPEN" && value !== "ALL" && count > 0 && (
                    <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                      {count}
                    </span>
                  )}
                  {value === "ALL" && (
                    <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sort toggle */}
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
            />
            {sortDir === "desc" ? "Newest first" : "Oldest first"}
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3.5">From</th>
                <th className="px-5 py-3.5">Against</th>
                <th className="px-5 py-3.5">Reason</th>
                <th className="px-5 py-3.5">Campaign</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Opened</th>
                <th className="px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-zinc-500">
                    <Scale className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
                    No disputes found
                    {filter !== "ALL" && (
                      <span>
                        {" "}
                        with status{" "}
                        <span className="font-medium text-zinc-400">
                          {filter.charAt(0) + filter.slice(1).toLowerCase().replace("_", " ")}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const { from, to, fromIcon, toIcon, isUserReport } = resolveParties(d);
                  return (
                  <tr
                    key={d.id}
                    className={`transition-colors hover:bg-zinc-900/60 ${
                      d.status === "CLOSED" || d.status === "RESOLVED" ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        {isUserReport && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                            <Flag className="h-2.5 w-2.5" /> Report
                          </span>
                        )}
                        <UserChip user={from} fallbackIcon={fromIcon} />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <UserChip user={to} fallbackIcon={toIcon} />
                    </td>
                    <td className="px-5 py-3.5 max-w-[160px]">
                      <p className="text-xs font-medium text-zinc-300 truncate">{reasonLabel(d.reason)}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-600 line-clamp-1">{d.description}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      {d.campaign ? (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                          <Megaphone className="h-3 w-3 text-zinc-600" />
                          <span className="truncate max-w-[120px]">{d.campaign.title}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-700 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={d.status} />
                    </td>
                    <td className="px-5 py-3.5 text-xs text-zinc-500">
                      {new Date(d.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setSelected(d)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
