import { db } from "@/lib/db";
import { Users } from "lucide-react";
import { UsersClient, type AdminUser } from "./UsersClient";

async function getUsers(): Promise<AdminUser[]> {
  return db.user.findMany({
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
    },
  });
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
