"use client";

import { useState, useTransition } from "react";
import {
  X,
  Check,
  Copy,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  createImportedCreatorAction,
  type CreateImportedCreatorInput,
  type CreateImportedCreatorResult,
} from "@/app/admin/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "form" | "submitting" | "social_duplicate" | "success";

type SuccessData = {
  userId: string;
  creatorProfileId: string;
  claimUrl: string;
  profileUrl: string;
  name: string;
  imageUrl: string | null;
};

type SocialDuplicateData = {
  duplicateProfileId: string;
  duplicateUserId: string;
  duplicateName: string | null;
  duplicateClaimStatus: string | null;
};

type EmailWarning = {
  count: number;
  matchingProfileIds: string[];
};

// ── Copy button helper ────────────────────────────────────────────────────────

function CopyButton({
  value,
  label,
  copiedKey,
  onCopy,
}: {
  value: string;
  label: string;
  copiedKey: string;
  onCopy: (value: string, key: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(value, label)}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:border-zinc-600 transition-colors"
    >
      {copiedKey === label ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-zinc-400" />
      )}
      {label}
    </button>
  );
}

// ── Input component ───────────────────────────────────────────────────────────

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400">
        {label}
        {required && <span className="ml-1 text-violet-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors disabled:opacity-50"
      />
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors resize-none disabled:opacity-50"
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AddImportedCreatorModal({ onClose }: { onClose: () => void }) {
  // ── Form state ──
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [niche, setNiche] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [threads, setThreads] = useState("");
  const [importedEmail, setImportedEmail] = useState("");
  const [totalFollowersStr, setTotalFollowersStr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  // ── Modal state ──
  const [phase, setPhase] = useState<Phase>("form");
  const [emailWarning, setEmailWarning] = useState<EmailWarning | null>(null);
  const [socialDuplicate, setSocialDuplicate] =
    useState<SocialDuplicateData | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [, startSubmit] = useTransition();

  // ── Copy helper ──
  function copy(value: string, key: string) {
    navigator.clipboard.writeText(value).catch(() => {
      toast.error("Could not copy to clipboard");
    });
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function getFullUrl(path: string): string {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://duolync.com";
    return `${base}${path}`;
  }

  // ── Submit ──
  function handleSubmit(acknowledgeEmail = false) {
    setFormError(null);

    const nameVal = name.trim();
    if (!nameVal) {
      setFormError("Name is required");
      return;
    }

    const totalFollowers = totalFollowersStr.trim()
      ? parseInt(totalFollowersStr.trim(), 10)
      : undefined;

    if (
      totalFollowersStr.trim() &&
      (isNaN(totalFollowers!) || totalFollowers! < 0)
    ) {
      setFormError("Total followers must be a non-negative number");
      return;
    }

    const socialLinks = [
      { platform: "instagram", url: instagram },
      { platform: "tiktok", url: tiktok },
      { platform: "youtube", url: youtube },
      { platform: "threads", url: threads },
    ].filter((l) => l.url.trim() !== "");

    const input: CreateImportedCreatorInput = {
      name: nameVal,
      imageUrl: imageUrl.trim() || undefined,
      bio: bio.trim() || undefined,
      niche: niche.trim() || undefined,
      location: location.trim() || undefined,
      socialLinks,
      importedEmail: importedEmail.trim() || undefined,
      totalFollowers,
      acknowledgeEmailDuplicate: acknowledgeEmail,
    };

    setPhase("submitting");

    startSubmit(async () => {
      const result: CreateImportedCreatorResult =
        await createImportedCreatorAction(input);

      if (result.success) {
        setSuccessData({
          userId: result.data.userId,
          creatorProfileId: result.data.creatorProfileId,
          claimUrl: result.data.claimUrl,
          profileUrl: result.data.profileUrl,
          name: nameVal,
          imageUrl: imageUrl.trim() || null,
        });
        setPhase("success");
        return;
      }

      if ("duplicateProfileId" in result) {
        setSocialDuplicate({
          duplicateProfileId: result.duplicateProfileId,
          duplicateUserId: result.duplicateUserId,
          duplicateName: result.duplicateName,
          duplicateClaimStatus: result.duplicateClaimStatus,
        });
        setPhase("social_duplicate");
        return;
      }

      if ("emailDuplicateWarning" in result) {
        setEmailWarning(result.emailDuplicateWarning);
        setPhase("form");
        return;
      }

      // Generic error
      setFormError(result.error ?? "Something went wrong");
      setPhase("form");
    });
  }

  function resetForAnother() {
    setName("");
    setImageUrl("");
    setNiche("");
    setBio("");
    setLocation("");
    setInstagram("");
    setTiktok("");
    setYoutube("");
    setThreads("");
    setImportedEmail("");
    setTotalFollowersStr("");
    setFormError(null);
    setEmailWarning(null);
    setSocialDuplicate(null);
    setSuccessData(null);
    setPhase("form");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase !== "submitting" ? onClose : undefined}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {phase === "success"
                ? "Creator created"
                : phase === "social_duplicate"
                ? "Duplicate identity found"
                : "Add Imported Creator"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {phase === "success"
                ? "Profile is live and ready for outreach"
                : phase === "social_duplicate"
                ? "A creator with this social account already exists"
                : "Create a public profile for outreach"}
            </p>
          </div>
          {phase !== "submitting" && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── Submitting ── */}
          {phase === "submitting" && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
            </div>
          )}

          {/* ── Social duplicate ── */}
          {phase === "social_duplicate" && socialDuplicate && (
            <div className="space-y-5">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-300">
                  <p className="font-medium">Duplicate social identity</p>
                  <p className="mt-1 text-amber-400/80">
                    A creator with this social account already exists
                    {socialDuplicate.duplicateName
                      ? `: ${socialDuplicate.duplicateName}`
                      : ""}
                    . Creating a duplicate profile is not allowed.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-4 space-y-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Existing profile
                </p>
                <p className="text-sm text-zinc-200 font-medium">
                  {socialDuplicate.duplicateName ?? "Creator"}
                </p>
                {socialDuplicate.duplicateClaimStatus && (
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-zinc-700 text-zinc-300">
                    {socialDuplicate.duplicateClaimStatus.replace("_", " ")}
                  </span>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={`/profile/${socialDuplicate.duplicateUserId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View profile
                  </a>
                  {socialDuplicate.duplicateClaimStatus !== "CLAIMED" && (
                    <button
                      onClick={() => {
                        onClose();
                        toast.info("Navigate to the existing profile to edit it");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition-colors"
                    >
                      Edit existing profile
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  setSocialDuplicate(null);
                  setPhase("form");
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Back to form
              </button>
            </div>
          )}

          {/* ── Success ── */}
          {phase === "success" && successData && (
            <div className="space-y-5">
              {/* Creator card */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex gap-3 items-center">
                <div className="h-12 w-12 rounded-full flex-shrink-0 border border-zinc-700 overflow-hidden bg-zinc-800 flex items-center justify-center">
                  {successData.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={successData.imageUrl}
                      alt={successData.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound className="h-5 w-5 text-zinc-500" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">{successData.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    <span className="text-violet-400">Imported</span>
                    {" · "}
                    <span className="text-zinc-500">Unclaimed</span>
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-400 ml-auto flex-shrink-0" />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <CopyButton
                  value={getFullUrl(successData.claimUrl)}
                  label="Copy Claim Link"
                  copiedKey={copiedKey ?? ""}
                  onCopy={copy}
                />
                <a
                  href={successData.claimUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                  Open Claim Page
                </a>
                <a
                  href={successData.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                  View Profile
                </a>
                <CopyButton
                  value={`Hi ${successData.name}, we've prepared a public creator profile for you on Duolync using publicly available information. You can review, claim, and customize it here: ${getFullUrl(successData.claimUrl)}`}
                  label="Copy Outreach Message"
                  copiedKey={copiedKey ?? ""}
                  onCopy={copy}
                />
              </div>

              {/* IDs for reference */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3 space-y-1.5 text-xs text-zinc-500">
                <p>
                  <span className="text-zinc-600">Claim URL</span>{" "}
                  <span className="font-mono text-zinc-400 break-all">
                    {getFullUrl(successData.claimUrl)}
                  </span>
                </p>
                <p>
                  <span className="text-zinc-600">Profile URL</span>{" "}
                  <span className="font-mono text-zinc-400 break-all">
                    {getFullUrl(successData.profileUrl)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* ── Form ── */}
          {phase === "form" && (
            <div className="space-y-6">
              {/* Generic error */}
              {formError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex gap-2 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Email duplicate warning (non-blocking) */}
              {emailWarning && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
                  <div className="flex gap-2 text-sm text-amber-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" />
                    <div>
                      <p className="font-medium">Contact email already in use</p>
                      <p className="mt-0.5 text-amber-400/80 text-xs">
                        {emailWarning.count === 1
                          ? "Another creator profile uses this contact email"
                          : `${emailWarning.count} creator profiles use this contact email`}
                        . This email may be a shared booking or agency address.
                        Social identities do not collide — you may still create
                        this profile.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-6">
                    <button
                      onClick={() => handleSubmit(true)}
                      className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                    >
                      Create anyway
                    </button>
                    <button
                      onClick={() => {
                        setEmailWarning(null);
                        setImportedEmail("");
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Clear email
                    </button>
                  </div>
                </div>
              )}

              {/* Section A: Basic Profile */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Basic Profile
                </h3>
                <FormInput
                  label="Name"
                  value={name}
                  onChange={setName}
                  placeholder="Creator name"
                  required
                />
                <div className="space-y-1.5">
                  <FormInput
                    label="Avatar URL"
                    value={imageUrl}
                    onChange={(v) => {
                      setImageUrl(v);
                      setImageLoadError(false);
                    }}
                    placeholder="https://example.com/avatar.jpg"
                    hint="HTTPS only. Leave blank if unknown."
                  />
                  {imageUrl.trim() && !imageLoadError && (
                    <div className="flex items-center gap-3 pt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl.trim()}
                        alt="Preview"
                        onError={() => setImageLoadError(true)}
                        className="h-10 w-10 rounded-full object-cover border border-zinc-700"
                      />
                      <span className="text-xs text-zinc-500">Preview</span>
                    </div>
                  )}
                  {imageLoadError && (
                    <p className="text-xs text-red-400">
                      Could not load image from this URL
                    </p>
                  )}
                </div>
                <FormInput
                  label="Niche"
                  value={niche}
                  onChange={setNiche}
                  placeholder="e.g. Lifestyle, Fitness, Tech"
                />
                <FormTextarea
                  label="Bio"
                  value={bio}
                  onChange={setBio}
                  placeholder="Short bio or description"
                />
                <FormInput
                  label="Location"
                  value={location}
                  onChange={setLocation}
                  placeholder="e.g. New York, NY"
                />
              </div>

              {/* Section B: Social Links */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Social Links
                </h3>
                <FormInput
                  label="Instagram"
                  value={instagram}
                  onChange={setInstagram}
                  placeholder="https://instagram.com/handle or handle"
                />
                <FormInput
                  label="TikTok"
                  value={tiktok}
                  onChange={setTiktok}
                  placeholder="https://tiktok.com/@handle or @handle"
                />
                <FormInput
                  label="YouTube"
                  value={youtube}
                  onChange={setYoutube}
                  placeholder="https://youtube.com/@handle"
                />
                <FormInput
                  label="Threads"
                  value={threads}
                  onChange={setThreads}
                  placeholder="https://threads.net/@handle or @handle"
                />
              </div>

              {/* Section C: Optional Contact & Metrics */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Optional Contact &amp; Metrics
                </h3>
                <FormInput
                  label="Contact Email"
                  value={importedEmail}
                  onChange={setImportedEmail}
                  placeholder="booking@example.com"
                  hint="Admin only · never public · not used for login"
                  type="email"
                />
                <FormInput
                  label="Total Followers"
                  value={totalFollowersStr}
                  onChange={setTotalFollowersStr}
                  placeholder="e.g. 250000"
                  type="number"
                  hint="Aggregate total only — no per-platform breakdown or engagement rate"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0">
          {phase === "form" && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit(false)}
                className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 py-2.5 text-sm font-medium text-white transition-colors"
              >
                Create Profile
              </button>
            </div>
          )}

          {phase === "success" && (
            <div className="flex gap-3">
              <button
                onClick={resetForAnother}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Create Another
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 py-2.5 text-sm font-medium text-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {phase === "social_duplicate" && (
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
