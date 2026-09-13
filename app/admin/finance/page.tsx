export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import {
  CampaignStatus,
  ContractStatus,
  MilestoneStatus,
} from "@/lib/generated/prisma";
import {
  DollarSign,
  TrendingUp,
  CheckCircle2,
  BarChart2,
  FileText,
  Layers,
  ArrowUpRight,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function humanStatus(raw: CampaignStatus): string {
  return raw.charAt(0) + raw.slice(1).toLowerCase().replace(/_/g, " ");
}

// ─── data fetch ─────────────────────────────────────────────────────────────

async function getFinanceData() {
  const [
    gmvAgg,
    activeAgg,
    completedAgg,
    avgAgg,
    totalCount,
    contractsTotalAgg,
    contractsActiveAgg,
    paidMilestonesAgg,
    campaigns,
  ] = await Promise.all([
    // 1. Total Platform Volume (GMV) – sum of ALL campaign budgets
    db.campaign.aggregate({ _sum: { budget: true } }),

    // 2. Active Capital – ACTIVE + IN_PROGRESS campaigns
    db.campaign.aggregate({
      where: { status: { in: [CampaignStatus.ACTIVE, CampaignStatus.IN_PROGRESS] } },
      _sum: { budget: true },
    }),

    // 3. Completed Payouts – COMPLETED campaigns
    db.campaign.aggregate({
      where: { status: CampaignStatus.COMPLETED },
      _sum: { budget: true },
    }),

    // 4. Average campaign budget
    db.campaign.aggregate({ _avg: { budget: true }, _count: { _all: true } }),

    // 5. Total campaign count
    db.campaign.count(),

    // 6. Total contracts value
    db.contract.aggregate({ _sum: { totalBudget: true } }),

    // 7. Active contracts value
    db.contract.aggregate({
      where: { status: ContractStatus.ACTIVE },
      _sum: { totalBudget: true },
    }),

    // 8. Paid milestones value
    db.milestone.aggregate({
      where: { status: MilestoneStatus.PAID },
      _sum: { amount: true },
    }),

    // 9. Campaign table ordered by budget desc
    db.campaign.findMany({
      orderBy: { budget: "desc" },
      include: {
        brand: { select: { companyName: true } },
        _count: { select: { contracts: true } },
      },
    }),
  ]);

  return {
    gmv: gmvAgg._sum.budget ?? 0,
    activeCapital: activeAgg._sum.budget ?? 0,
    completedPayouts: completedAgg._sum.budget ?? 0,
    avgBudget: avgAgg._avg.budget ?? 0,
    totalCount,
    contractsTotal: contractsTotalAgg._sum.totalBudget ?? 0,
    contractsActive: contractsActiveAgg._sum.totalBudget ?? 0,
    paidMilestones: paidMilestonesAgg._sum.amount ?? 0,
    campaigns,
  };
}

// ─── status badge colours ───────────────────────────────────────────────────

const statusStyles: Record<CampaignStatus, string> = {
  DRAFT:       "bg-zinc-700/40 text-zinc-400",
  ACTIVE:      "bg-emerald-500/20 text-emerald-300",
  PAUSED:      "bg-amber-500/20 text-amber-300",
  COMPLETED:   "bg-blue-500/20 text-blue-300",
  CANCELLED:   "bg-red-500/20 text-red-400",
  PENDING:     "bg-zinc-700/40 text-zinc-400",
  ACCEPTED:    "bg-teal-500/20 text-teal-300",
  IN_PROGRESS: "bg-violet-500/20 text-violet-300",
  SUBMITTED:   "bg-pink-500/20 text-pink-300",
};

// ─── page ────────────────────────────────────────────────────────────────────

export default async function AdminFinancePage() {
  const data = await getFinanceData();
  const maxBudget = data.campaigns[0]?.budget ?? 1;

  const activePct  = pct(data.activeCapital,    data.gmv);
  const completedPct = pct(data.completedPayouts, data.gmv);

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
          <DollarSign className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Financial Analytics</h1>
          <p className="text-sm text-zinc-400">
            Platform-wide budget & payout overview — {data.totalCount} campaigns
          </p>
        </div>
      </div>

      {/* ── Primary stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">

        {/* GMV */}
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-violet-400" />}
          label="Total Platform Volume"
          sublabel="Gross Merchandise Value"
          value={fmtUSD(data.gmv)}
          accent="violet"
          badge={`${data.totalCount} campaigns`}
        />

        {/* Active Capital */}
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          label="Active Capital"
          sublabel="Running campaigns"
          value={fmtUSD(data.activeCapital)}
          accent="emerald"
          badge={`${activePct}% of GMV`}
        />

        {/* Completed Payouts */}
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-blue-400" />}
          label="Completed Payouts"
          sublabel="Finished campaigns"
          value={fmtUSD(data.completedPayouts)}
          accent="blue"
          badge={`${completedPct}% of GMV`}
        />

        {/* Average Budget */}
        <StatCard
          icon={<BarChart2 className="h-5 w-5 text-amber-400" />}
          label="Avg Campaign Budget"
          sublabel="Mean per campaign"
          value={fmtUSD(data.avgBudget)}
          accent="amber"
          badge="per campaign"
        />
      </div>

      {/* ── Secondary stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Total Contracts Value */}
        <StatCard
          icon={<FileText className="h-5 w-5 text-teal-400" />}
          label="Total Contracts Value"
          sublabel="Signed contract budgets"
          value={fmtUSD(data.contractsTotal)}
          accent="teal"
          badge="all statuses"
          compact
        />

        {/* Active Contracts Value */}
        <StatCard
          icon={<Layers className="h-5 w-5 text-violet-400" />}
          label="Active Contracts"
          sublabel="In-flight contract value"
          value={fmtUSD(data.contractsActive)}
          accent="violet"
          badge="status: ACTIVE"
          compact
        />

        {/* Paid Milestones */}
        <StatCard
          icon={<ArrowUpRight className="h-5 w-5 text-emerald-400" />}
          label="Paid Milestones"
          sublabel="Total released to creators"
          value={fmtUSD(data.paidMilestones)}
          accent="emerald"
          badge="status: PAID"
          compact
        />
      </div>

      {/* ── GMV breakdown bar ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <p className="mb-3 text-sm font-semibold text-zinc-300">GMV Breakdown</p>
        <div className="overflow-hidden rounded-full bg-zinc-800 h-3 flex">
          {/* Active */}
          {activePct > 0 && (
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${activePct}%` }}
              title={`Active: ${activePct}%`}
            />
          )}
          {/* Completed */}
          {completedPct > 0 && (
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${completedPct}%` }}
              title={`Completed: ${completedPct}%`}
            />
          )}
          {/* Other */}
          {100 - activePct - completedPct > 0 && (
            <div
              className="h-full bg-zinc-700 transition-all"
              style={{ width: `${100 - activePct - completedPct}%` }}
              title="Other statuses"
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Active {activePct}% — {fmtUSD(data.activeCapital)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            Completed {completedPct}% — {fmtUSD(data.completedPayouts)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
            Other {100 - activePct - completedPct}%
          </span>
        </div>
      </div>

      {/* ── Campaign Financial Performance Table ────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold text-zinc-100">
            Campaign Financial Performance
          </p>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
            Sorted by highest budget
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3.5 w-10">#</th>
                <th className="px-5 py-3.5">Campaign</th>
                <th className="px-5 py-3.5">Brand</th>
                <th className="px-5 py-3.5">Budget</th>
                <th className="px-5 py-3.5">Budget Share</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Contracts</th>
                <th className="px-5 py-3.5">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data.campaigns.map((campaign, idx) => {
                const share = Math.round((campaign.budget / maxBudget) * 100);
                return (
                  <tr
                    key={campaign.id}
                    className="transition-colors hover:bg-zinc-900/60"
                  >
                    {/* rank */}
                    <td className="px-5 py-3.5 text-zinc-600 font-mono text-xs">
                      {idx + 1}
                    </td>

                    {/* title */}
                    <td className="px-5 py-3.5 font-medium text-zinc-200 max-w-[220px]">
                      <span className="line-clamp-1">{campaign.title}</span>
                    </td>

                    {/* brand */}
                    <td className="px-5 py-3.5 text-zinc-400">
                      {campaign.brand.companyName}
                    </td>

                    {/* budget */}
                    <td className="px-5 py-3.5 font-semibold text-zinc-100 tabular-nums">
                      {fmtUSD(campaign.budget)}
                    </td>

                    {/* budget bar */}
                    <td className="px-5 py-3.5 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums w-8 text-right">
                          {share}%
                        </span>
                      </div>
                    </td>

                    {/* status badge */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[campaign.status]}`}
                      >
                        {humanStatus(campaign.status)}
                      </span>
                    </td>

                    {/* contracts */}
                    <td className="px-5 py-3.5 text-zinc-400">
                      {campaign._count.contracts}
                    </td>

                    {/* created at */}
                    <td className="px-5 py-3.5 text-zinc-500">
                      {new Date(campaign.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data.campaigns.length === 0 && (
            <p className="py-12 text-center text-zinc-500">No campaign data yet.</p>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── StatCard component ──────────────────────────────────────────────────────

type Accent = "violet" | "emerald" | "blue" | "amber" | "teal";

const accentRing: Record<Accent, string> = {
  violet: "border-violet-800/40",
  emerald: "border-emerald-800/30",
  blue:    "border-blue-800/30",
  amber:   "border-amber-800/30",
  teal:    "border-teal-800/30",
};

const accentBadge: Record<Accent, string> = {
  violet: "bg-violet-500/10 text-violet-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  blue:    "bg-blue-500/10 text-blue-400",
  amber:   "bg-amber-500/10 text-amber-400",
  teal:    "bg-teal-500/10 text-teal-400",
};

function StatCard({
  icon,
  label,
  sublabel,
  value,
  accent,
  badge,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: string;
  accent: Accent;
  badge: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-zinc-950 p-5 ${accentRing[accent]}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="text-xs text-zinc-600">{sublabel}</p>
        </div>
        <div className="rounded-lg bg-zinc-900 p-2">{icon}</div>
      </div>

      <p className={`mt-4 font-bold tracking-tight text-zinc-100 ${compact ? "text-2xl" : "text-3xl"}`}>
        {value}
      </p>

      <div className="mt-3">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${accentBadge[accent]}`}>
          {badge}
        </span>
      </div>
    </div>
  );
}
