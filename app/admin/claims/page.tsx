export const dynamic = "force-dynamic";

import { FileSearch } from "lucide-react";
import { getPendingClaimsAction } from "@/app/actions/claim";
import { ClaimsClient } from "./ClaimsClient";

export default async function AdminClaimsPage() {
  const { data: claims, error } = await getPendingClaimsAction();

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-center gap-3">
        <FileSearch className="h-6 w-6 text-zinc-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Profile Claims</h1>
          <p className="text-sm text-zinc-400">
            {claims.length} pending claim{claims.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-6 py-4 text-sm text-red-400">
          {error}
        </div>
      ) : (
        <ClaimsClient initialClaims={claims} />
      )}
    </div>
  );
}
