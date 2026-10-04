"use client";

import { useState, useTransition, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  GitMerge,
  ShieldAlert,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import {
  approveProfileClaimAction,
  rejectProfileClaimAction,
  mergeAndApproveClaimAction,
  getClaimMergePreviewAction,
} from "@/app/actions/claim";
import type { PendingClaim, ClaimMergePreview } from "@/app/actions/claim";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Resolution label helpers ────────────────────────────────────────────────

const RESOLUTION_LABELS: Record<string, string> = {
  user_r_wins_gate1_token:   "UserR wins (OAuth token — Gate 1)",
  user_r_wins_authority:     "UserR wins (higher authority)",
  user_p_wins_authority:     "Placeholder wins (higher authority) — will migrate",
  user_r_wins_freshness:     "UserR wins (more recent)",
  user_p_wins_freshness:     "Placeholder wins (more recent) — will migrate",
  no_conflict_migrate:       "No conflict — placeholder stat migrated",
};

// ─── Merge preview panel (lazy-loaded for Scenario B claims) ─────────────────

function MergePreviewPanel({ claimId, onMergeSuccess, onReject }: {
  claimId: string;
  onMergeSuccess: () => void;
  onReject: () => void;
}) {
  const [preview, setPreview] = useState<ClaimMergePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const loadPreview = useCallback(async () => {
    if (previewLoaded) return;
    setPreviewLoading(true);
    const result = await getClaimMergePreviewAction(claimId);
    setPreviewLoading(false);
    setPreviewLoaded(true);
    if (result.error || !result.preview) {
      setPreviewError(result.error ?? "Failed to load preview.");
    } else {
      setPreview(result.preview);
    }
  }, [claimId, previewLoaded]);

  // Load preview on first render of this panel
  useState(() => { void loadPreview(); });

  function handleMergeApprove() {
    setMergeError(null);
    setMergeSuccess(null);
    startTransition(async () => {
      const result = await mergeAndApproveClaimAction(claimId);
      if (result.success) {
        setMergeSuccess("Merge complete. Profile ownership transferred and accounts merged.");
        onMergeSuccess();
      } else {
        setMergeError(result.error ?? "Merge failed.");
      }
    });
  }

  function handleReject() {
    setMergeError(null);
    startTransition(async () => {
      const result = await rejectProfileClaimAction(claimId, rejectReason || undefined);
      if (result.success) {
        onReject();
      } else {
        setMergeError(result.error ?? "Rejection failed.");
      }
    });
  }

  const hasHardBlocks = (preview?.hardBlocks?.length ?? 0) > 0;

  return (
    <div className="border-t border-zinc-800 space-y-4 p-4">

      {/* Preview loading */}
      {previewLoading && (
        <div className="flex items-center gap-2 text-zinc-500 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading merge preview…
        </div>
      )}

      {previewError && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {previewError}
        </p>
      )}

      {preview && (
        <>
          {/* Profile comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Imported profile */}
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 space-y-1">
              <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Imported Profile</p>
              <p className="text-sm font-medium text-zinc-100">{preview.importedProfile.name ?? "—"}</p>
              {preview.importedProfile.niche && (
                <p className="text-xs text-zinc-400">Niche: {preview.importedProfile.niche}</p>
              )}
              {preview.importedProfile.bio && (
                <p className="text-xs text-zinc-500 line-clamp-2">{preview.importedProfile.bio}</p>
              )}
              {preview.importedProfile.importedEmail && (
                <p className="text-xs text-violet-400 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {preview.importedProfile.importedEmail}
                </p>
              )}
              {(preview.importedProfile.followerCount ?? 0) > 0 && (
                <p className="text-xs text-zinc-400">
                  ~{(preview.importedProfile.followerCount ?? preview.importedProfile.totalFollowers).toLocaleString()} followers (imported)
                </p>
              )}
            </div>

            {/* Registered profile */}
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 space-y-1">
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Registered Profile</p>
              <p className="text-sm font-medium text-zinc-100">{preview.registeredProfile.name ?? "—"}</p>
              {preview.registeredProfile.niche && (
                <p className="text-xs text-zinc-400">Niche: {preview.registeredProfile.niche}</p>
              )}
              {preview.registeredProfile.bio && (
                <p className="text-xs text-zinc-500 line-clamp-2">{preview.registeredProfile.bio}</p>
              )}
              <p className="text-xs text-zinc-400">
                {preview.registeredProfile.applicationCount} application(s) · {preview.registeredProfile.contractCount} contract(s)
              </p>
              {preview.registeredProfile.moderationStatus === "APPROVED" && (
                <p className="text-xs text-emerald-400">Currently marketplace-approved (will reset to PENDING)</p>
              )}
            </div>
          </div>

          {/* OAuth platforms */}
          {preview.oauthPlatforms.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">OAuth-connected Platforms</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.oauthPlatforms.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats conflicts */}
          {preview.statConflicts.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Platform Stats Resolution</p>
              <div className="space-y-1">
                {preview.statConflicts.map((c) => (
                  <div key={c.platform} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="text-zinc-300 min-w-[80px]">{c.platform}</span>
                    <span className="text-zinc-500">{RESOLUTION_LABELS[c.resolution] ?? c.resolution}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Safe auto-merge summary */}
          {preview.safeAutoMerge.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Safe auto-merge</p>
              </div>
              <ul className="space-y-0.5">
                {preview.safeAutoMerge.map((item, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Hard blocks */}
          {preview.hardBlocks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Hard Blocks — merge disabled</p>
              </div>
              <div className="space-y-1">
                {preview.hardBlocks.map((b) => (
                  <div key={b.code} className="rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2">
                    <p className="text-[10px] font-mono text-red-300 mb-0.5">{b.code}</p>
                    <p className="text-xs text-red-200/80">{b.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Feedback */}
      {mergeError && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {mergeError}
        </p>
      )}
      {mergeSuccess && (
        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          {mergeSuccess}
        </p>
      )}

      {/* Actions */}
      {!mergeSuccess && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleMergeApprove}
            disabled={isPending || previewLoading || hasHardBlocks || !previewLoaded}
            title={hasHardBlocks ? "Resolve hard blocks before merging" : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitMerge className="h-3.5 w-3.5" />
            )}
            {isPending ? "Merging…" : "Merge & Approve"}
          </button>

          {!showRejectForm ? (
            <button
              onClick={() => setShowRejectForm(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional rejection reason (shown to requester)…"
                rows={2}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 transition-colors"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Standard claim row (Scenario A) ─────────────────────────────────────────

function ClaimRow({ claim, onRefresh }: { claim: PendingClaim; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await approveProfileClaimAction(claim.id);
      if (result.success) {
        setSuccess("Claim approved. Profile ownership transferred.");
        onRefresh();
      } else {
        setError(result.error ?? "Approval failed.");
      }
    });
  }

  function handleReject() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await rejectProfileClaimAction(claim.id, rejectReason || undefined);
      if (result.success) {
        setSuccess("Claim rejected. Profile returned to UNCLAIMED.");
        setShowRejectForm(false);
        onRefresh();
      } else {
        setError(result.error ?? "Rejection failed.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded((x) => !x)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-zinc-100">
              {claim.creatorProfile.user.name ?? "Unnamed Profile"}
            </span>
            {claim.requiresMerge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <AlertTriangle className="h-3 w-3" />
                MERGE REQUIRED
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <Clock className="h-3 w-3" />
              PENDING
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{formatDate(claim.requestedAt)}</p>
        </div>
        <div className="text-zinc-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail — Scenario B: show merge panel */}
      {expanded && claim.requiresMerge && (
        <MergePreviewPanel
          claimId={claim.id}
          onMergeSuccess={onRefresh}
          onReject={onRefresh}
        />
      )}

      {/* Expanded detail — Scenario A: standard review */}
      {expanded && !claim.requiresMerge && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {/* Target profile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Target Profile</p>
              <p className="text-sm text-zinc-100">{claim.creatorProfile.user.name ?? "—"}</p>
              <p className="text-xs text-zinc-400">Niche: {claim.creatorProfile.niche ?? "—"}</p>
              <p className="text-xs text-zinc-400">Bio: {claim.creatorProfile.bio?.slice(0, 80) ?? "—"}</p>
              {claim.creatorProfile.importedEmail && (
                <p className="text-xs text-violet-400 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Imported email: {claim.creatorProfile.importedEmail}
                </p>
              )}
            </div>

            {/* Requester */}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Requester</p>
              {claim.requester ? (
                <>
                  <p className="text-sm text-zinc-100 flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-zinc-500" />
                    {claim.requester.name ?? "—"}
                  </p>
                  <p className="text-xs text-zinc-400 flex items-center gap-1">
                    <Mail className="h-3 w-3 text-zinc-500" />
                    {claim.requester.email}
                  </p>
                </>
              ) : (
                <p className="text-xs text-zinc-500 italic">Requester account deleted</p>
              )}
            </div>
          </div>

          {/* Evidence */}
          {(claim.evidenceNote || claim.evidenceEmail || claim.evidencePlatform || claim.evidenceHandle) && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Evidence Provided</p>
              <div className="rounded-lg bg-zinc-800/60 p-3 space-y-1 text-xs text-zinc-300">
                {claim.evidenceNote && <p><span className="text-zinc-500">Note:</span> {claim.evidenceNote}</p>}
                {claim.evidenceEmail && <p><span className="text-zinc-500">Email:</span> {claim.evidenceEmail}</p>}
                {claim.evidencePlatform && <p><span className="text-zinc-500">Platform:</span> {claim.evidencePlatform}</p>}
                {claim.evidenceHandle && <p><span className="text-zinc-500">Handle:</span> {claim.evidenceHandle}</p>}
              </div>
            </div>
          )}

          {/* Feedback */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{success}</p>
          )}

          {/* Scenario A actions */}
          {!success && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isPending ? "Processing…" : "Approve"}
              </button>

              {!showRejectForm ? (
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
              ) : (
                <div className="flex flex-col gap-2 w-full">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Optional rejection reason (shown to requester)…"
                    rows={2}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleReject}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 transition-colors"
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Claims list ──────────────────────────────────────────────────────────────

export function ClaimsClient({ initialClaims }: { initialClaims: PendingClaim[] }) {
  const [claims, setClaims] = useState(initialClaims);

  function handleRefresh() {
    // Remove resolved claims from local state.
    // In production this could use router.refresh() for a full server re-fetch.
    setClaims((prev) => prev.filter((c) => c.status === "PENDING"));
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm">No pending claim requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {claims.map((claim) => (
        <ClaimRow key={claim.id} claim={claim} onRefresh={handleRefresh} />
      ))}
    </div>
  );
}
