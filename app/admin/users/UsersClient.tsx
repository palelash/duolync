"use client";

import { useMemo, useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Trash2,
  ShieldBan,
  ShieldCheck,
  UserPlus,
  Copy,
  Check,
  X,
  Loader2,
  Plus,
  Pencil,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateTestUser,
  deleteUser,
  banUser,
  unbanUser,
} from "@/app/admin/actions";
import { fromPrismaRole } from "@/lib/roles";
import { AddImportedCreatorModal } from "./_components/AddImportedCreatorModal";
import { EditImportedCreatorModal } from "./_components/EditImportedCreatorModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  hasCompletedOnboarding: boolean;
  createdAt: Date;
  // Imported creator builder fields
  isImported: boolean;
  creatorProfile: {
    id: string;
    claimStatus: string;
    profileOrigin: string;
  } | null;
};

export type SummaryStats = {
  total: number;
  creators: number;
  brands: number;
  importedCreators: number;
  registeredCreators: number;
};

type RoleFilter = "all" | "creator" | "brand";
type OriginFilter = "all" | "registered" | "imported";

type SortKey = "name" | "email" | "role" | "origin" | "banned" | "emailVerified" | "createdAt";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────

const roleBadge: Record<string, { label: string; classes: string }> = {
  admin: { label: "Admin", classes: "bg-violet-500/20 text-violet-300 border border-violet-500/30" },
  brand: { label: "Brand", classes: "bg-blue-500/20 text-blue-300 border border-blue-500/30" },
  creator: { label: "Creator", classes: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
};

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } }) {
  if (sort.key !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
  return sort.dir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 inline-block text-violet-400" />
    : <ChevronDown className="h-3 w-3 ml-1 inline-block text-violet-400" />;
}

// Origin badge
const originBadge = {
  imported: {
    label: "Imported",
    classes: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  },
  registered: {
    label: "Registered",
    classes: "bg-teal-500/15 text-teal-300 border border-teal-500/25",
  },
} as const;

// Summary stat card
function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 min-w-[110px]">
      <span className={`text-xl font-bold tabular-nums ${accent ? "text-violet-300" : "text-zinc-100"}`}>
        {value}
      </span>
      <span className="text-xs text-zinc-500 leading-tight">{label}</span>
    </div>
  );
}

// Filter button group
function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-zinc-500 shrink-0">{label}:</span>
      <div className="flex items-center gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              value === o.id
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                : "border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Credentials modal ─────────────────────────────────────────────────────────

type Credentials = { name: string; email: string; password: string; type: string };

function CredentialsModal({
  creds,
  onClose,
}: {
  creds: Credentials;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Test user created</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              <span className="capitalize">{creds.type}</span> account — save these before closing
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {(
            [
              { label: "Name", value: creds.name, field: "name" },
              { label: "Email", value: creds.email, field: "email" },
              { label: "Password", value: creds.password, field: "password" },
            ] as const
          ).map(({ label, value, field }) => (
            <div key={field} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-zinc-200 break-all">{value}</span>
                <button
                  onClick={() => copy(value, field)}
                  className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                >
                  {copied === field ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-zinc-800 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        <p className="mt-2 text-sm text-zinc-400">{description}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${confirmClass}`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Imported creator overflow menu ────────────────────────────────────────────

function ImportedCreatorMenu({
  user,
  onEdit,
}: {
  user: AdminUser;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const cp = user.creatorProfile!;
  const isUnclaimed = cp.claimStatus === "UNCLAIMED";
  const isPending = cp.claimStatus === "CLAIM_PENDING";

  const claimPath = `/claim/${cp.id}`;
  const profilePath = `/profile/${user.id}`;

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((p) => !p);
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(label);
    setOpen(false);
  }

  const menu = (
    <div
      ref={menuRef}
      style={menuPos ? { top: menuPos.top, right: menuPos.right } : {}}
      className="fixed z-[9999] w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl py-1 text-sm"
    >
      {/* Edit — UNCLAIMED or CLAIM_PENDING */}
      {(isUnclaimed || isPending) && (
        <button
          onClick={() => { onEdit(); setOpen(false); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5 text-zinc-500" />
          Edit Imported Profile
        </button>
      )}

      {/* Copy Claim Link — UNCLAIMED or CLAIM_PENDING */}
      {(isUnclaimed || isPending) && (
        <button
          onClick={() =>
            copyText(`${window.location.origin}${claimPath}`, "Claim link copied!")
          }
          className="flex w-full items-center gap-2.5 px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Copy className="h-3.5 w-3.5 text-zinc-500" />
          Copy Claim Link
        </button>
      )}

      {/* Open Claim Page — UNCLAIMED or CLAIM_PENDING */}
      {(isUnclaimed || isPending) && (
        <a
          href={claimPath}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpen(false)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
          Open Claim Page
        </a>
      )}

      {/* Copy Outreach Message — UNCLAIMED only */}
      {isUnclaimed && (
        <button
          onClick={() => {
            const url = `${window.location.origin}${claimPath}`;
            const msg = `Hi ${user.name ?? "there"}, we've prepared a public creator profile for you on Duolync using publicly available information. You can review, claim, and customize it here: ${url}`;
            copyText(msg, "Outreach message copied!");
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Copy className="h-3.5 w-3.5 text-zinc-500" />
          Copy Outreach Message
        </button>
      )}

      {/* Divider before View Profile */}
      <div className="mx-3 my-1 border-t border-zinc-800" />

      {/* View Profile — always */}
      <a
        href={profilePath}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpen(false)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
        View Profile
      </a>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
        title="Imported creator actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && createPortal(menu, document.body)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UsersClient({ initialUsers, summary }: { initialUsers: AdminUser[]; summary: SummaryStats }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "createdAt",
    dir: "desc",
  });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [generating, startGenerating] = useTransition();
  const [creds, setCreds] = useState<Credentials | null>(null);

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{
    action: "delete" | "ban" | "unban";
    userId: string;
    userName: string;
  } | null>(null);
  const [actionPending, startAction] = useTransition();

  // Per-row loading state (userId)
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // ── Imported creator modals ──
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<{
    creatorProfileId: string;
    userId: string;
    claimStatus: string;
  } | null>(null);

  // ── Sort helpers ──
  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  // ── Filtered & sorted list ──
  const users = useMemo(() => {
    const q = search.toLowerCase().trim();

    const filtered = initialUsers.filter((u) => {
      // Role filter
      if (roleFilter !== "all") {
        const userRole = String(u.role).toUpperCase();
        if (roleFilter === "creator" && userRole !== "CREATOR") return false;
        if (roleFilter === "brand" && userRole !== "BRAND") return false;
      }

      // Origin filter (authoritative: isImported)
      if (originFilter === "imported" && !u.isImported) return false;
      if (originFilter === "registered" && u.isImported) return false;

      // Search
      if (q) {
        return (
          u.name?.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          fromPrismaRole(u.role).includes(q)
        );
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "name":
          cmp = (a.name ?? "").localeCompare(b.name ?? "");
          break;
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "origin":
          cmp = Number(a.isImported) - Number(b.isImported);
          break;
        case "banned":
          cmp = Number(a.banned) - Number(b.banned);
          break;
        case "emailVerified":
          cmp = Number(a.emailVerified) - Number(b.emailVerified);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [initialUsers, sort, search, roleFilter, originFilter]);

  // ── Generate test user ──
  function handleGenerate(type: "brand" | "creator") {
    startGenerating(async () => {
      const res = await generateTestUser(type);
      if (res.success && res.data) {
        setCreds(res.data);
      } else {
        toast.error(res.error ?? "Failed to create test user");
      }
    });
  }

  // ── Execute confirmed action ──
  function executeConfirmed() {
    if (!confirm) return;
    const { action, userId, userName } = confirm;
    setLoadingId(userId);
    startAction(async () => {
      let res;
      if (action === "delete") res = await deleteUser(userId);
      else if (action === "ban") res = await banUser(userId);
      else res = await unbanUser(userId);

      setConfirm(null);
      setLoadingId(null);

      if (res.success) {
        const messages = {
          delete: `${userName} has been deleted`,
          ban: `${userName} has been suspended`,
          unban: `${userName} has been reinstated`,
        };
        toast.success(messages[action]);
      } else {
        toast.error(res.error ?? "Action failed");
      }
    });
  }

  // ── Sortable column header ──
  function Th({
    col,
    children,
    className = "",
  }: {
    col: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <th
        className={`px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer select-none hover:text-zinc-300 transition-colors ${className}`}
        onClick={() => toggleSort(col)}
      >
        {children}
        <SortIcon col={col} sort={sort} />
      </th>
    );
  }

  return (
    <>
      {/* Modals */}
      {creds && <CredentialsModal creds={creds} onClose={() => setCreds(null)} />}
      {addModalOpen && (
        <AddImportedCreatorModal onClose={() => setAddModalOpen(false)} />
      )}
      {editProfile && (
        <EditImportedCreatorModal
          creatorProfileId={editProfile.creatorProfileId}
          userId={editProfile.userId}
          initialClaimStatus={editProfile.claimStatus}
          onClose={() => setEditProfile(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.action === "delete"
              ? "Delete user?"
              : confirm.action === "ban"
              ? "Suspend user?"
              : "Reinstate user?"
          }
          description={
            confirm.action === "delete"
              ? `This will permanently delete "${confirm.userName}" and all associated data. This cannot be undone.`
              : confirm.action === "ban"
              ? `"${confirm.userName}" will be immediately logged out and blocked from accessing the platform.`
              : `"${confirm.userName}" will be able to log in again.`
          }
          confirmLabel={
            confirm.action === "delete"
              ? "Delete"
              : confirm.action === "ban"
              ? "Suspend"
              : "Reinstate"
          }
          confirmClass={
            confirm.action === "delete"
              ? "bg-red-600 hover:bg-red-500 text-white"
              : confirm.action === "ban"
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          }
          onConfirm={executeConfirmed}
          onCancel={() => setConfirm(null)}
          loading={actionPending}
        />
      )}

      {/* ── Summary metric cards ── */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Total Accounts" value={summary.total} />
        <StatCard label="Creators" value={summary.creators} />
        <StatCard label="Brands" value={summary.brands} />
        <StatCard label="Imported Creators" value={summary.importedCreators} accent />
        <StatCard label="Registered Creators" value={summary.registeredCreators} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <input
          type="search"
          placeholder="Search by name, email or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 sm:max-w-xs transition-colors"
        />

        {/* Generate button group + Add Imported Creator */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">Generate test user:</span>
          <button
            onClick={() => handleGenerate("creator")}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            Creator
          </button>
          <button
            onClick={() => handleGenerate("brand")}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            Brand
          </button>
          {/* Add Imported Creator */}
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Imported Creator
          </button>
        </div>
      </div>

      {/* ── Role + Origin filters ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterGroup<RoleFilter>
          label="Role"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { id: "all", label: "All" },
            { id: "creator", label: "Creators" },
            { id: "brand", label: "Brands" },
          ]}
        />
        <FilterGroup<OriginFilter>
          label="Origin"
          value={originFilter}
          onChange={setOriginFilter}
          options={[
            { id: "all", label: "All" },
            { id: "registered", label: "Registered" },
            { id: "imported", label: "Imported" },
          ]}
        />
        {/* Filtered result count */}
        <span className="ml-auto text-xs text-zinc-500 tabular-nums">
          {users.length} {users.length === 1 ? "user" : "users"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <Th col="name">Name</Th>
                <Th col="email">Email</Th>
                <Th col="role">Role</Th>
                <Th col="origin">Origin</Th>
                <Th col="banned">Status</Th>
                <Th col="emailVerified">Verified</Th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Onboarded
                </th>
                <Th col="createdAt">Joined</Th>
                <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/60">
              {users.map((user) => {
                const userType = fromPrismaRole(user.role);
                const badge = roleBadge[userType] ?? roleBadge.creator;
                const isLoading = loadingId === user.id;

                return (
                  <tr
                    key={user.id}
                    className={`transition-colors hover:bg-zinc-900/60 ${user.banned ? "opacity-60" : ""}`}
                  >
                    {/* Name */}
                    <td className="px-5 py-3.5 font-medium text-zinc-200 whitespace-nowrap">
                      {user.name ?? <span className="text-zinc-600">—</span>}
                    </td>

                    {/* Email */}
                    <td className="px-5 py-3.5 text-zinc-400 whitespace-nowrap">
                      {user.email}
                    </td>

                    {/* Role */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Origin */}
                    <td className="px-5 py-3.5">
                      {(() => {
                        const ob = user.isImported ? originBadge.imported : originBadge.registered;
                        return (
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ob.classes}`}>
                            {ob.label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      {user.banned ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400"
                          title={user.banReason ?? undefined}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      )}
                    </td>

                    {/* Verified */}
                    <td className="px-5 py-3.5">
                      {user.emailVerified ? (
                        <span className="text-emerald-400" title="Email verified">✓</span>
                      ) : (
                        <span className="text-zinc-600" title="Not verified">✗</span>
                      )}
                    </td>

                    {/* Onboarded */}
                    <td className="px-5 py-3.5">
                      {user.hasCompletedOnboarding ? (
                        <span className="text-emerald-400" title="Onboarding complete">✓</span>
                      ) : (
                        <span className="text-zinc-600" title="Not onboarded">✗</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-5 py-3.5 text-zinc-500 whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Imported creator overflow menu */}
                        {user.isImported && user.creatorProfile && (
                          <ImportedCreatorMenu
                            user={user}
                            onEdit={() =>
                              setEditProfile({
                                creatorProfileId: user.creatorProfile!.id,
                                userId: user.id,
                                claimStatus: user.creatorProfile!.claimStatus,
                              })
                            }
                          />
                        )}
                        {/* Ban / Unban */}
                        {userType !== "admin" &&
                          (user.banned ? (
                            <button
                              disabled={isLoading}
                              onClick={() =>
                                setConfirm({
                                  action: "unban",
                                  userId: user.id,
                                  userName: user.name ?? user.email,
                                })
                              }
                              title="Reinstate user"
                              className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              disabled={isLoading}
                              onClick={() =>
                                setConfirm({
                                  action: "ban",
                                  userId: user.id,
                                  userName: user.name ?? user.email,
                                })
                              }
                              title="Suspend user"
                              className="rounded-md p-1.5 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                            >
                              <ShieldBan className="h-4 w-4" />
                            </button>
                          ))}

                        {/* Delete */}
                        {userType !== "admin" && (
                          <button
                            disabled={isLoading}
                            onClick={() =>
                              setConfirm({
                                action: "delete",
                                userId: user.id,
                                userName: user.name ?? user.email,
                              })
                            }
                            title="Delete user"
                            className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <p className="py-12 text-center text-zinc-500">
            {search || roleFilter !== "all" || originFilter !== "all"
              ? "No users match the current filters."
              : "No users found."}
          </p>
        )}
      </div>

      {/* Footer count */}
      <p className="text-right text-xs text-zinc-600">
        {users.length} of {initialUsers.length} users
      </p>
    </>
  );
}
