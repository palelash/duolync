// Server component: handles ProfileAlias redirect before rendering ProfileView.
// This is the ONLY place where ProfileAlias lookup should happen — NOT in middleware
// (which runs on the Edge runtime and cannot access Prisma).

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import ProfileView from "@/pages/ProfileView";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // ProfileAlias lookup: if 'id' is a former placeholder User.id, redirect to
  // the current canonical profile URL (/profile/{currentOwner.userId}).
  // This resolves dynamically via the FK: alias → creatorProfile → userId,
  // so it never goes stale even if ownership changes again in the future.
  const alias = await db.profileAlias.findUnique({
    where: { fromUserId: id },
    select: {
      creatorProfile: {
        select: { userId: true },
      },
    },
  });

  if (alias) {
    redirect(`/profile/${alias.creatorProfile.userId}`);
  }

  // Pass the resolved id as profileId prop so ProfileView does not need to
  // call useParams() for server-side resolved IDs.
  return <ProfileView profileId={id} />;
}
