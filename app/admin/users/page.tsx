export const dynamic = 'force-dynamic';

import { db } from "@/lib/db";
import { Users } from "lucide-react";
import { UsersClient, type AdminUser } from "./UsersClient";

async function getUsers(): Promise<AdminUser[]> {
  const rows = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      emailVerified: true,
      hasCompletedOnboarding: true,
      createdAt: true,
      isImported: true,
      creatorProfile: {
        select: {
          id: true,
          claimStatus: true,
          profileOrigin: true,
        },
      },
    },
  });

  // Map enum values to plain strings for the client component
  return rows.map((r) => ({
    ...r,
    creatorProfile: r.creatorProfile
      ? {
          id: r.creatorProfile.id,
          claimStatus: r.creatorProfile.claimStatus as string,
          profileOrigin: r.creatorProfile.profileOrigin as string,
        }
      : null,
  }));
}

export default async function AdminUsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-zinc-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Users</h1>
          <p className="text-sm text-zinc-400">{users.length} total accounts</p>
        </div>
      </div>

      {/* Interactive table */}
      <UsersClient initialUsers={users} />
    </div>
  );
}
