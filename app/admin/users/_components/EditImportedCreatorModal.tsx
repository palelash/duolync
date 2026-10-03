"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import {
  getImportedCreatorForEditAction,
  updateImportedCreatorAction,
  type ImportedCreatorEditData,
  type UpdateImportedCreatorInput,
} from "@/app/admin/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "loading" | "form" | "submitting" | "success" | "load_error";

// ── Shared sub-components ─────────────────────────────────────────────────────

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  disabled,
  locked,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="block text-xs font-medium text-zinc-400">{label}</label>
        {locked && (
          <span aria-label="Locked while claim is pending">
            <Lock className="h-3 w-3 text-zinc-600" />
          </span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={locked || !onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
          locked
            ? "border-zinc-800 bg-zinc-800/30 text-zinc-600 cursor-not-allowed"
            : "border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
        } disabled:opacity-50`}
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

export function EditImportedCreatorModal({
  creatorProfileId,
  onClose,
}: {
  creatorProfileId: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ImportedCreatorEditData | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  // ── Form field state ──
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [threads, setThreads] = useState("");
  const [importedEmail, setImportedEmail] = useState("");
  const [totalFollowersStr, setTotalFollowersStr] = useState("");

  const [, startSubmit] = useTransition();

  // ── Load data on open ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getImportedCreatorForEditAction(creatorProfileId);
      if (cancelled) return;

      if (!result.success || !result.data) {
        setLoadError(result.error ?? "Failed to load profile data");
        setPhase("load_error");
        return;
      }

      const d = result.data;
      setProfileData(d);

      // Populate form fields
      setName(d.name ?? "");
      setImageUrl(d.imageUrl ?? "");
      setBio(d.bio ?? "");
      setNiche(d.niche ?? "");
      setLocation(d.location ?? "");
      setImportedEmail(d.importedEmail ?? "");
      setTotalFollowersStr(
        d.totalFollowers != null && d.totalFollowers > 0
          ? String(d.totalFollowers)
          : "",
      );

      // Social links
      const ig = d.socialLinks.find((l) => l.platform === "instagram");
      const tt = d.socialLinks.find((l) => l.platform === "tiktok");
      const yt = d.socialLinks.find((l) => l.platform === "youtube");
      const th = d.socialLinks.find((l) => l.platform === "threads");
      setInstagram(ig?.url ?? "");
      setTiktok(tt?.url ?? "");
      setYoutube(yt?.url ?? "");
      setThreads(th?.url ?? "");

      setPhase("form");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [creatorProfileId]);

  const claimStatus = profileData?.claimStatus ?? "";
  const isClaimPending = claimStatus === "CLAIM_PENDING";
  const isClaimed = claimStatus === "CLAIMED";

  function handleSubmit() {
    if (!profileData) return;
    setFormError(null);

    const nameVal = name.trim();
    if (!nameVal) {
      setFormError("Name is required");
      return;
    }

    const totalFollowers = totalFollowersStr.trim()
      ? parseInt(totalFollowersStr.trim(), 10)
      : null;

    if (
      totalFollowersStr.trim() &&
      (isNaN(totalFollowers!) || totalFollowers! < 0)
    ) {
      setFormError("Total followers must be a non-negative number");
      return;
    }

    const input: UpdateImportedCreatorInput = {
      name: nameVal,
      imageUrl: imageUrl.trim() || null,
      bio: bio.trim() || null,
      niche: niche.trim() || null,
      location: location.trim() || null,
    };

    // Only include restricted fields for UNCLAIMED
    if (!isClaimPending) {
      const socialLinks = [
        { platform: "instagram", url: instagram },
        { platform: "tiktok", url: tiktok },
        { platform: "youtube", url: youtube },
        { platform: "threads", url: threads },
      ].filter((l) => l.url.trim() !== "");

      input.socialLinks = socialLinks;
      input.importedEmail = importedEmail.trim() || null;
      input.totalFollowers = totalFollowers;
    }

    setPhase("submitting");

    startSubmit(async () => {
      const result = await updateImportedCreatorAction(creatorProfileId, input);

      if (result.success) {
        setPhase("success");
        return;
      }

      setFormError(result.error ?? "Failed to update profile");
      setPhase("form");
    });
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
                ? "Profile updated"
                : "Edit Imported Profile"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {isClaimPending
                ? "Claim pending — only presentation fields can be changed"
                : isClaimed
                ? "This profile has been claimed and cannot be edited here"
                : "Edit public and contact fields"}
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

          {/* Loading */}
          {phase === "loading" && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
            </div>
          )}

          {/* Submitting */}
          {phase === "submitting" && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
            </div>
          )}

          {/* Load error */}
          {phase === "load_error" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-zinc-400">{loadError}</p>
            </div>
          )}

          {/* Success */}
          {phase === "success" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <div>
                <p className="font-semibold text-zinc-100">Profile updated</p>
                <p className="text-sm text-zinc-500 mt-1">
                  Changes have been saved
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          {phase === "form" && !isClaimed && (
            <div className="space-y-6">
              {/* Claim pending notice */}
              {isClaimPending && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex gap-2 text-sm text-amber-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" />
                  <span>
                    A claim is pending review. Social links, contact email, and
                    follower count are locked to protect claim evidence.
                  </span>
                </div>
              )}

              {/* Generic error */}
              {formError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex gap-2 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Presentation fields (always editable) */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Basic Profile
                </h3>
                <FormInput
                  label="Name"
                  value={name}
                  onChange={setName}
                  placeholder="Creator name"
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
                    hint="HTTPS only"
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

              {/* Social links — locked when CLAIM_PENDING */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Social Links
                  </h3>
                  {isClaimPending && (
                    <Lock className="h-3 w-3 text-zinc-600" />
                  )}
                </div>
                <FormInput
                  label="Instagram"
                  value={instagram}
                  onChange={isClaimPending ? undefined : setInstagram}
                  placeholder="https://instagram.com/handle"
                  locked={isClaimPending}
                />
                <FormInput
                  label="TikTok"
                  value={tiktok}
                  onChange={isClaimPending ? undefined : setTiktok}
                  placeholder="https://tiktok.com/@handle"
                  locked={isClaimPending}
                />
                <FormInput
                  label="YouTube"
                  value={youtube}
                  onChange={isClaimPending ? undefined : setYoutube}
                  placeholder="https://youtube.com/@handle"
                  locked={isClaimPending}
                />
                <FormInput
                  label="Threads"
                  value={threads}
                  onChange={isClaimPending ? undefined : setThreads}
                  placeholder="https://threads.net/@handle"
                  locked={isClaimPending}
                />
              </div>

              {/* Contact & metrics — locked when CLAIM_PENDING */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Contact &amp; Metrics
                  </h3>
                  {isClaimPending && (
                    <Lock className="h-3 w-3 text-zinc-600" />
                  )}
                </div>
                <FormInput
                  label="Contact Email"
                  value={importedEmail}
                  onChange={isClaimPending ? undefined : setImportedEmail}
                  placeholder="booking@example.com"
                  hint="Admin only · never public · not used for login"
                  type="email"
                  locked={isClaimPending}
                />
                <FormInput
                  label="Total Followers"
                  value={totalFollowersStr}
                  onChange={isClaimPending ? undefined : setTotalFollowersStr}
                  placeholder="e.g. 250000"
                  type="number"
                  hint="Aggregate only — no engagement rate"
                  locked={isClaimPending}
                />
              </div>
            </div>
          )}

          {/* Claimed — show error state if somehow reached */}
          {phase === "form" && isClaimed && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <Lock className="h-8 w-8 text-zinc-600" />
              <div>
                <p className="font-semibold text-zinc-300">Profile claimed</p>
                <p className="text-sm text-zinc-500 mt-1">
                  This profile has been claimed by its owner and cannot be
                  edited through the imported creator builder.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0">
          {(phase === "form" && !isClaimed) && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 py-2.5 text-sm font-medium text-white transition-colors"
              >
                Save Changes
              </button>
            </div>
          )}

          {(phase === "success" ||
            phase === "load_error" ||
            (phase === "form" && isClaimed)) && (
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
