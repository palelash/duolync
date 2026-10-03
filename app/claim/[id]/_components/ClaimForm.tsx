"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestProfileClaimAction } from "@/app/actions/claim";
import { Shield, AlertCircle } from "lucide-react";

interface ClaimFormProps {
  profileId: string;
  requiresMerge?: boolean;
}

export function ClaimForm({ profileId, requiresMerge }: ClaimFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceEmail, setEvidenceEmail] = useState("");
  const [evidencePlatform, setEvidencePlatform] = useState("");
  const [evidenceHandle, setEvidenceHandle] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestProfileClaimAction(profileId, {
        evidenceNote: evidenceNote || undefined,
        evidenceEmail: evidenceEmail || undefined,
        evidencePlatform: evidencePlatform || undefined,
        evidenceHandle: evidenceHandle || undefined,
      });

      if (result.success) {
        router.push(`/claim/${profileId}/pending`);
      } else {
        setError(result.error ?? "Failed to submit claim.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {requiresMerge && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 text-sm text-orange-300 flex gap-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-400" />
          <span>
            You already have a creator profile on Duolync. Your claim request will be submitted but will require manual
            review and merging before it can be approved.
          </span>
        </div>
      )}

      {/* Evidence fields */}
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Help us verify your identity by providing any of the following. All fields are optional but increase
          the likelihood of approval.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Verification note
          </label>
          <textarea
            value={evidenceNote}
            onChange={(e) => setEvidenceNote(e.target.value)}
            placeholder="Explain why this profile belongs to you (handle, posting history, etc.)"
            rows={3}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Email on the account
            </label>
            <input
              type="email"
              value={evidenceEmail}
              onChange={(e) => setEvidenceEmail(e.target.value)}
              placeholder="creator@example.com"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Platform
            </label>
            <select
              value={evidencePlatform}
              onChange={(e) => setEvidencePlatform(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition"
            >
              <option value="">Select platform…</option>
              {["Instagram", "TikTok", "YouTube", "Twitter", "LinkedIn", "Twitch"].map((p) => (
                <option key={p} value={p.toLowerCase()}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Handle / username
            </label>
            <input
              type="text"
              value={evidenceHandle}
              onChange={(e) => setEvidenceHandle(e.target.value)}
              placeholder="@yourhandle"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <Shield className="h-4 w-4" />
        {isPending ? "Submitting claim…" : "Submit claim request"}
      </button>

      <p className="text-xs text-zinc-500 text-center">
        By submitting, you confirm that this profile represents you or your brand. False claims may result
        in account suspension.
      </p>
    </form>
  );
}
