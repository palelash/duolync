import { db } from "@/lib/db";
import { Role, CampaignStatus } from "@/lib/generated/prisma";
import { Users, Briefcase, Megaphone, TrendingUp } from "lucide-react";

async function getStats() {
  const [totalUsers, totalBrands, totalCreators, activeCampaigns] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: Role.BRAND } }),
      db.user.count({ where: { role: Role.CREATOR } }),
      db.campaign.count({ where: { status: CampaignStatus.ACTIVE } }),
    ]);

  return { totalUsers, totalBrands, totalCreators, activeCampaigns };
}

const statCards = [
  {
    label: "Total Users",
    key: "totalUsers" as const,
    icon: Users,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    label: "Total Brands",
    key: "totalBrands" as const,
    icon: Briefcase,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    label: "Total Creators",
    key: "totalCreators" as const,
    icon: TrendingUp,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
  {
    label: "Active Campaigns",
    key: "activeCampaigns" as const,
    icon: Megaphone,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
];

export default async function AdminDashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Platform overview at a glance.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, key, icon: Icon, color, bg }) => (
          <div
            key={key}
            className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm"
          >
            <div className={`rounded-lg ${bg} p-3`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-sm text-zinc-400">{label}</p>
              <p className="mt-0.5 text-2xl font-bold text-zinc-100">
                {stats[key].toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-200">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/users"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            View all users →
          </a>
          <a
            href="/admin/campaigns"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            View all campaigns →
          </a>
        </div>
      </div>
    </div>
  );
}
