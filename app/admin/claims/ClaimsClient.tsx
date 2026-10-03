"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, User, Mail } from "lucide-react";
import { approveProfileClaimAction, rejectProfileClaimAction } from "@/app/actions/claim";
import type { PendingClaim } from "@/app/actions/claim";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

      {/* Expanded detail */}
      {expanded && (
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

          {/* Merge required warning */}
          {claim.requiresMerge && (
            <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-xs text-orange-300">
              <strong>Merge required.</strong> This claim was flagged because the requester already has a creator
              profile or there are platform token/stats conflicts. Approval is blocked until the Merge/Dedupe
              workflow is implemented.
            </div>
          )}

          {/* Feedback */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{success}</p>
          )}

          {/* Actions */}
          {!success && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleApprove}
                disabled={isPending || claim.requiresMerge}
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

export function ClaimsClient({ initialClaims }: { initialClaims: PendingClaim[] }) {
  const [claims, setClaims] = useState(initialClaims);

  // Simple client-side refresh: remove resolved claims from the list
  function handleRefresh() {
    // In production this would re-fetch; for now just remove approved/rejected items
    // The page will show stale data until the user manually refreshes.
    // A future improvement could use router.refresh() or SWR.
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
