// Public claim entry route — accessible without authentication or onboarding.
// This route is intentionally OUTSIDE all protected middleware prefixes so that:
//   - Unauthenticated visitors can see the creator identity
//   - New registrants can submit a claim before completing onboarding
//   - The claim intent is preserved through sign-in/sign-up via callbackUrl

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { ClaimForm } from "./_components/ClaimForm";
import { Shield, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";

function SocialHandle({ platform, url }: { platform: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-violet-400 transition-colors"
    >
      <ExternalLink className="h-3 w-3" />
      {platform}
    </a>
  );
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: profileId } = await params;

  // ── Load public creator identity (never expose importedEmail) ────────────
  const profile = await db.creatorProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      profileOrigin: true,
      claimStatus: true,
      bio: true,
      niche: true,
      socialLinks: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-zinc-600 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-100">Profile not found</h1>
          <p className="text-zinc-400 text-sm">This creator profile does not exist or has been removed.</p>
          <Link href="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  // ── If already claimed, show a closed notice ─────────────────────────────
  if (profile.claimStatus === "CLAIMED") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-100">Profile already claimed</h1>
          <p className="text-zinc-400 text-sm">
            This creator profile has been claimed by its owner and is no longer available.
          </p>
          <Link href="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  // ── If not an importable profile, show error ─────────────────────────────
  if (profile.profileOrigin !== "IMPORTED") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-zinc-600 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-100">Not claimable</h1>
          <p className="text-zinc-400 text-sm">
            This profile is not eligible for claiming.
          </p>
          <Link href="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  // ── Check current session ────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  const currentUser = session?.user ?? null;

  // Build safe social links array
  const rawLinks = Array.isArray(profile.socialLinks) ? profile.socialLinks : [];
  const socialLinks = rawLinks as { platform: string; url: string }[];

  // ── Check if this user already has a pending/approved claim ──────────────
  let existingClaimStatus: string | null = null;
  let existingProfileForMergeCheck = false;
  let dbCurrentUser: { isImported: boolean } | null = null;

  if (currentUser) {
    const [existingClaim, creatorProfile, fullUser] = await Promise.all([
      db.profileClaim.findFirst({
        where: { creatorProfileId: profileId, requesterUserId: currentUser.id },
        select: { status: true },
        orderBy: { requestedAt: "desc" },
      }),
      db.creatorProfile.findUnique({
        where: { userId: currentUser.id },
        select: { id: true },
      }),
      // Fetch isImported which is not in the Better Auth session user type
      db.user.findUnique({
        where: { id: currentUser.id },
        select: { isImported: true },
      }),
    ]);
    existingClaimStatus = existingClaim?.status ?? null;
    existingProfileForMergeCheck = creatorProfile !== null;
    dbCurrentUser = fullUser;
  }

  // ── Determine eligibility ────────────────────────────────────────────────
  let ineligibilityReason: string | null = null;
  if (currentUser) {
    if (dbCurrentUser?.isImported) {
      ineligibilityReason = "Imported accounts cannot submit claim requests.";
    } else if (currentUser.role !== "CREATOR") {
      ineligibilityReason = "Only creator accounts can claim profiles.";
    } else if (!currentUser.emailVerified) {
      ineligibilityReason = "Please verify your email address before claiming a profile.";
    } else if (currentUser.banned) {
      ineligibilityReason = "Your account is suspended.";
    } else if (existingClaimStatus === "PENDING") {
      // Already has a pending claim for this profile → show status
      redirect(`/claim/${profileId}/pending`);
    }
  }

  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const callbackUrl = `/claim/${profileId}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Claim your creator profile</h1>
            <p className="text-sm text-zinc-400">Verify your identity to take ownership of this profile</p>
          </div>
        </div>

        {/* Creator identity card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex gap-4">
          {profile.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.user.image}
              alt={profile.user.name ?? "Creator"}
              className="h-16 w-16 rounded-full object-cover flex-shrink-0 border-2 border-zinc-700"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-zinc-800 border-2 border-zinc-700 flex-shrink-0 flex items-center justify-center text-zinc-500 text-xl font-bold">
              {(profile.user.name ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-lg leading-tight">{profile.user.name ?? "Creator profile"}</p>
            {profile.niche && (
              <p className="text-sm text-zinc-400">{profile.niche}</p>
            )}
            {profile.bio && (
              <p className="text-sm text-zinc-500 line-clamp-2">{profile.bio}</p>
            )}
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1">
                {socialLinks.map((link) => (
                  <SocialHandle key={link.platform} platform={link.platform} url={link.url} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Claim status: if profile is already CLAIM_PENDING */}
        {profile.claimStatus === "CLAIM_PENDING" && !existingClaimStatus && (
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 flex gap-3 text-sm text-yellow-300">
            <Clock className="h-4 w-4 mt-0.5 flex-shrink-0 text-yellow-400" />
            <span>Another creator has submitted a claim for this profile. It is currently under review.</span>
          </div>
        )}

        {/* Main content: unauthenticated / ineligible / eligible */}
        {!currentUser ? (
          // Unauthenticated: show sign-in/sign-up prompt
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <h2 className="font-semibold text-lg">Sign in to claim this profile</h2>
            <p className="text-sm text-zinc-400">
              Create an account or sign in to your Duolync account, then return here to submit your claim.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}&intent=claim`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                Sign in
              </Link>
              <Link
                href={`/sign-in?mode=signup&callbackUrl=${encodeURIComponent(callbackUrl)}&intent=claim`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : ineligibilityReason ? (
          // Authenticated but ineligible
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
            <div className="flex items-start gap-3 text-amber-400">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">You cannot claim this profile</p>
                <p className="text-sm text-zinc-400 mt-1">{ineligibilityReason}</p>
              </div>
            </div>
          </div>
        ) : profile.claimStatus !== "UNCLAIMED" && profile.claimStatus !== "CLAIM_PENDING" ? (
          // Not claimable
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <p className="text-zinc-400 text-sm">This profile is not currently available for claiming.</p>
          </div>
        ) : existingClaimStatus && existingClaimStatus !== "PENDING" ? (
          // Prior claim exists (rejected / cancelled / approved for another profile)
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            {existingClaimStatus === "REJECTED" || existingClaimStatus === "CANCELLED" ? (
              <>
                <p className="text-sm text-zinc-400">
                  Your previous claim for this profile was {existingClaimStatus.toLowerCase()}. You may submit
                  a new claim if you believe you are the rightful owner.
                </p>
                <ClaimForm profileId={profileId} requiresMerge={existingProfileForMergeCheck} />
              </>
            ) : (
              <p className="text-sm text-zinc-400">
                Your claim for this profile has already been {existingClaimStatus.toLowerCase()}.
              </p>
            )}
          </div>
        ) : profile.claimStatus === "UNCLAIMED" ? (
          // Eligible, profile is unclaimed
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-lg">Submit your claim</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Our team will review your claim within 1–3 business days. You&apos;ll receive an email notification
                when a decision is made.
              </p>
            </div>
            <ClaimForm profileId={profileId} requiresMerge={existingProfileForMergeCheck} />
          </div>
        ) : (
          // Profile is CLAIM_PENDING and user has no pending claim
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <p className="text-sm text-zinc-400">
              This profile currently has a pending claim request. Please check back later.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-zinc-600 text-center">
          This page is accessible at{" "}
          <span className="text-zinc-500">{baseUrl}/claim/{profileId}</span>
        </p>
      </div>
    </div>
  );
}
