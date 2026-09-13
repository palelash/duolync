export const dynamic = 'force-dynamic';

import { db } from "@/lib/db";
import { CampaignStatus } from "@/lib/generated/prisma";
import { Megaphone } from "lucide-react";

async function getCampaigns() {
  return db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      brand: {
        select: { companyName: true },
      },
      _count: {
        select: { applications: true },
      },
    },
  });
}

const statusStyles: Record<CampaignStatus, string> = {
  DRAFT: "bg-zinc-700/40 text-zinc-400",
  ACTIVE: "bg-emerald-500/20 text-emerald-300",
  PAUSED: "bg-amber-500/20 text-amber-300",
  COMPLETED: "bg-blue-500/20 text-blue-300",
  CANCELLED: "bg-red-500/20 text-red-400",
  PENDING: "bg-zinc-700/40 text-zinc-400",
  ACCEPTED: "bg-teal-500/20 text-teal-300",
  IN_PROGRESS: "bg-violet-500/20 text-violet-300",
  SUBMITTED: "bg-pink-500/20 text-pink-300",
};

export default async function AdminCampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-zinc-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Campaigns</h1>
          <p className="text-sm text-zinc-400">{campaigns.length} total campaigns</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-5 py-3.5">Title</th>
              <th className="px-5 py-3.5">Brand</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Budget</th>
              <th className="px-5 py-3.5">Applications</th>
              <th className="px-5 py-3.5">Deadline</th>
              <th className="px-5 py-3.5">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {campaigns.map((campaign) => (
              <tr
                key={campaign.id}
                className="transition-colors hover:bg-zinc-900/60"
              >
                <td className="px-5 py-3.5 font-medium text-zinc-200">
                  {campaign.title}
                </td>
                <td className="px-5 py-3.5 text-zinc-400">
                  {campaign.brand.companyName}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[campaign.status]}`}
                  >
                    {campaign.status.charAt(0) +
                      campaign.status.slice(1).toLowerCase().replace("_", " ")}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-zinc-300">
                  ${campaign.budget.toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-zinc-400">
                  {campaign._count.applications}
                </td>
                <td className="px-5 py-3.5 text-zinc-500">
                  {campaign.deadline
                    ? new Date(campaign.deadline).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-5 py-3.5 text-zinc-500">
                  {new Date(campaign.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {campaigns.length === 0 && (
          <p className="py-12 text-center text-zinc-500">No campaigns found.</p>
        )}
      </div>
    </div>
  );
}
