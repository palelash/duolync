// Claim pending status page — shown after a creator submits a claim request.
// Accessible without onboarding completion; does NOT redirect to /onboarding.

import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMyClaimStatusAction } from "@/app/actions/claim";
import { Clock, CheckCircle2, XCircle, AlertCircle, ArrowLeft } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Approved
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-500/15 text-red-400 border border-red-500/30">
        <XCircle className="h-3.5 w-3.5" />
        Not approved
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-zinc-700/50 text-zinc-400 border border-zinc-600/30">
        <XCircle className="h-3.5 w-3.5" />
        Cancelled
      </span>
    );
  }
  // PENDING
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
      <Clock className="h-3.5 w-3.5" />
      Under review
    </span>
  );
}

export default async function ClaimPendingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: profileId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-zinc-600 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-100">Sign in to view claim status</h1>
          <Link
            href={`/sign-in?callbackUrl=${encodeURIComponent(`/claim/${profileId}/pending`)}`}
            className="inline-block px-5 py-2.5 rounded-xl font-semibold text-sm bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const { claim } = await getMyClaimStatusAction(profileId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">

        {/* Back */}
        <Link
          href={`/claim/${profileId}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>

        {!claim ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-zinc-600 mx-auto" />
            <h1 className="text-xl font-bold">No claim found</h1>
            <p className="text-sm text-zinc-400">
              We couldn&apos;t find a claim request from your account for this profile.
            </p>
            <Link
              href={`/claim/${profileId}`}
              className="inline-block text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
              Submit a claim
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 space-y-6">
            <div className="space-y-2">
              <StatusBadge status={claim.status} />
              <h1 className="text-2xl font-bold">
                {claim.status === "PENDING" && "Your claim is under review"}
                {claim.status === "APPROVED" && "Your claim has been approved!"}
                {claim.status === "REJECTED" && "Your claim was not approved"}
                {claim.status === "CANCELLED" && "Your claim was cancelled"}
              </h1>
              <p className="text-sm text-zinc-500">
                Submitted {new Date(claim.requestedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* Status-specific content */}
            {claim.status === "PENDING" && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Our team is reviewing your claim. This usually takes 1–3 business days. You&apos;ll receive an
                  email notification when a decision is made.
                </p>
                <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-4 space-y-2 text-sm">
                  <p className="text-zinc-300 font-medium">While you wait:</p>
                  <ul className="list-disc list-inside text-zinc-400 space-y-1">
                    <li>You can still browse Duolync and explore opportunities</li>
                    <li>You will not be able to complete creator onboarding until this claim is resolved</li>
                    <li>If your claim is approved, you&apos;ll be able to complete your profile setup</li>
                  </ul>
                </div>
                {claim.requiresMerge && (
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 text-sm text-orange-300">
                    <strong>Note:</strong> Your claim requires a profile merge because you already have a Duolync
                    creator profile. This requires additional manual review.
                  </div>
                )}
              </div>
            )}

            {claim.status === "APPROVED" && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Congratulations! The imported profile has been transferred to your account. You can now complete
                  your creator profile setup.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition-all"
                >
                  Complete your profile setup
                </Link>
              </div>
            )}

            {claim.status === "REJECTED" && (
              <div className="space-y-4">
                {claim.rejectionReason && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
                    <strong>Reason:</strong> {claim.rejectionReason}
                  </div>
                )}
                <p className="text-sm text-zinc-400">
                  Your claim was not approved. You can still create your own creator profile on Duolync by
                  completing onboarding.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
                >
                  Create your own profile
                </Link>
              </div>
            )}

            {claim.status === "CANCELLED" && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  This claim was cancelled. You may submit a new claim if you believe you are the rightful owner
                  of this profile.
                </p>
                <Link
                  href={`/claim/${profileId}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
                >
                  Submit a new claim
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
