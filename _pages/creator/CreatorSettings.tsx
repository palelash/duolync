"use client";

import { useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Shield, Trash2, X, Save, Loader2,
  AlertTriangle, Bell, Check, Eye, EyeOff,
} from "lucide-react";
import ActiveSessions from "@/components/security/ActiveSessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UploadButton } from "@/lib/uploadthing";
import { updateAvatarAction, updateProfileAction } from "@/app/actions/profile";
import { deleteAccount } from "@/app/actions/account";

// ── Types ─────────────────────────────────────────────────────────────────────

type NavTab = "profile" | "security" | "notifications" | "danger";

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4">{children}</p>
  );
}

// ── Avatar Section ────────────────────────────────────────────────────────────

function AvatarSection({
  avatarUrl,
  name,
  onAvatarChange,
}: {
  avatarUrl: string | null;
  name: string | null;
  onAvatarChange: (url: string | null) => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);

  const initials = (name ?? "U")
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleRemove() {
    setIsUpdating(true);
    const { error } = await updateAvatarAction(null);
    if (error) toast.error(error);
    else { onAvatarChange(null); toast.success("Avatar removed"); }
    setIsUpdating(false);
  }

  return (
    <Section>
      <SectionTitle>Profile Picture</SectionTitle>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-zinc-200 dark:ring-zinc-700">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name ?? ""} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">{initials}</span>
              </div>
            )}
          </div>
          {isUpdating && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <UploadButton
            endpoint="profileImageUploader"
            onClientUploadComplete={async (res) => {
              const url = res[0]?.ufsUrl ?? res[0]?.url;
              if (!url) return;
              setIsUpdating(true);
              const { error } = await updateAvatarAction(url);
              if (error) toast.error(error);
              else { onAvatarChange(url); toast.success("Avatar updated"); }
              setIsUpdating(false);
            }}
            onUploadError={(err) => {
              console.error("[UploadThing]", err);
              toast.error("Upload failed — please try again");
            }}
            appearance={{
              button:
                "ut-uploading:cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors h-auto",
              allowedContent: "hidden",
            }}
            content={{ button: "Change photo" }}
          />
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUpdating}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-red-500 text-xs transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Remove photo
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({
  avatarUrl,
  onAvatarChange,
}: {
  avatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    name: profile?.full_name ?? "",
    bio: profile?.bio ?? "",
    niche: profile?.niche ?? "",
    location: profile?.location ?? "",
  });

  function handleSave() {
    startTransition(async () => {
      const { error } = await updateProfileAction({
        name: form.name || null,
        bio: form.bio || null,
        niche: form.niche || null,
        location: form.location || null,
      });
      if (error) toast.error(error);
      else { await refreshProfile(); toast.success("Profile saved"); }
    });
  }

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <AvatarSection avatarUrl={avatarUrl} name={profile?.full_name ?? null} onAvatarChange={onAvatarChange} />

      <Section>
        <SectionTitle>Personal Details</SectionTitle>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Display Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Your name or handle"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Bio</Label>
            <Textarea
              value={form.bio}
              onChange={(e) => setForm((s) => ({ ...s, bio: e.target.value }))}
              placeholder="Tell brands about yourself and your content..."
              rows={4}
              className="rounded-xl resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Niche</Label>
              <Input
                value={form.niche}
                onChange={(e) => setForm((s) => ({ ...s, niche: e.target.value }))}
                placeholder="e.g., Gaming, Tech"
                className="rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground">Comma-separated</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
                placeholder="City, Country"
                className="rounded-xl"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={isPending}
          className="mt-5 btn-gradient rounded-xl px-5 h-9 text-sm font-medium gap-1.5"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </Section>
    </motion.div>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const { profile } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChangePassword() {
    if (pwForm.next !== pwForm.confirm) {
      toast.error("New passwords don't match");
      return;
    }
    if (pwForm.next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    startTransition(async () => {
      // Better Auth client-side changePassword via API route
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { message?: string }).message ?? "Failed to change password");
        return;
      }
      toast.success("Password updated successfully");
      setShowPasswordForm(false);
      setPwForm({ current: "", next: "", confirm: "" });
    });
  }

  return (
    <motion.div
      key="security"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <Section>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <Shield className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">Account Security</p>
            <p className="text-muted-foreground text-xs">Manage your authentication settings</p>
          </div>
        </div>

        <div className="space-y-0 divide-y divide-zinc-100 dark:divide-zinc-800">
          {/* Email row */}
          <div className="flex items-center justify-between py-3.5">
            <div>
              <p className="text-sm font-medium">Email Address</p>
              <p className="text-xs text-muted-foreground mt-0.5">{profile?.email}</p>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-medium">
              Verified
            </span>
          </div>

          {/* Password row */}
          <div className="py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {showPasswordForm ? "Enter your current and new password" : "Change your login password"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordForm((v) => !v)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors"
              >
                {showPasswordForm ? "Cancel" : "Change"}
              </button>
            </div>

            <AnimatePresence>
              {showPasswordForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Current Password</Label>
                      <div className="relative">
                        <Input
                          type={showPw ? "text" : "password"}
                          value={pwForm.current}
                          onChange={(e) => setPwForm((s) => ({ ...s, current: e.target.value }))}
                          className="rounded-xl pr-9"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">New Password</Label>
                        <Input
                          type="password"
                          value={pwForm.next}
                          onChange={(e) => setPwForm((s) => ({ ...s, next: e.target.value }))}
                          className="rounded-xl"
                          placeholder="Min. 8 characters"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Confirm New Password</Label>
                        <Input
                          type="password"
                          value={pwForm.confirm}
                          onChange={(e) => setPwForm((s) => ({ ...s, confirm: e.target.value }))}
                          className="rounded-xl"
                          placeholder="Repeat password"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleChangePassword}
                      disabled={isPending || !pwForm.current || !pwForm.next || !pwForm.confirm}
                      className="btn-gradient rounded-xl h-9 px-4 text-sm gap-1.5"
                    >
                      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {isPending ? "Updating…" : "Update Password"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 2FA row */}
          <div className="flex items-center justify-between py-3.5">
            <div>
              <p className="text-sm font-medium">Two-Factor Authentication</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add an extra layer of security</p>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700">
              Coming soon
            </span>
          </div>
        </div>
      </Section>

      <Section>
        <ActiveSessions />
      </Section>
    </motion.div>
  );
}

// ── Notification Preferences ──────────────────────────────────────────────────

const NOTIF_PREFS_KEY = "nexly:notif_prefs";

interface NotifPrefs {
  newInvitations: boolean;
  proposalUpdates: boolean;
  messages: boolean;
  marketing: boolean;
}

const NOTIF_DEFAULTS: NotifPrefs = {
  newInvitations: true,
  proposalUpdates: true,
  messages: true,
  marketing: false,
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        checked ? "bg-violet-600" : "bg-zinc-200 dark:bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>(NOTIF_DEFAULTS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOTIF_PREFS_KEY);
      if (saved) setPrefs({ ...NOTIF_DEFAULTS, ...JSON.parse(saved) as NotifPrefs });
    } catch {
      // use defaults
    }
  }, []);

  function update(key: keyof NotifPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
    toast.success("Preference saved");
  }

  const rows: { key: keyof NotifPrefs; label: string; sub: string }[] = [
    {
      key: "newInvitations",
      label: "Campaign Invitations",
      sub: "Get notified when a brand invites you to a campaign",
    },
    {
      key: "proposalUpdates",
      label: "Application Updates",
      sub: "Accepted, declined, and counter-offer notifications",
    },
    {
      key: "messages",
      label: "New Messages",
      sub: "Alerts when you receive a new direct message",
    },
    {
      key: "marketing",
      label: "Tips & Product Updates",
      sub: "Platform news, feature releases, and creator tips",
    },
  ];

  return (
    <motion.div
      key="notifications"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <Section>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <Bell className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">Notification Preferences</p>
            <p className="text-muted-foreground text-xs">Choose what you want to be notified about</p>
          </div>
        </div>

        <div className="space-y-0 divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between py-4 gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{row.sub}</p>
              </div>
              <Toggle checked={prefs[row.key]} onChange={(v) => update(row.key, v)} />
            </div>
          ))}
        </div>
      </Section>
    </motion.div>
  );
}

// ── Danger Zone Tab ───────────────────────────────────────────────────────────

function DangerTab() {
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount();
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete account");
        return;
      }
      toast.success("Account deleted");
      router.replace("/auth");
    });
  }

  return (
    <motion.div
      key="danger"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-sm text-red-700 dark:text-red-200">Delete Account</p>
            <p className="text-red-500/80 dark:text-red-400/70 text-xs">This action is permanent and cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-5">
          Deleting your account will permanently remove all your data, profile, messages, and
          history from Duolync. This cannot be reversed.
        </p>

        {!showConfirm ? (
          <Button
            type="button"
            onClick={() => setShowConfirm(true)}
            variant="outline"
            className="border-red-300 dark:border-red-600/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-600/10 hover:border-red-400 dark:hover:border-red-600/50 rounded-xl h-9 px-4 text-sm font-medium gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete my account
          </Button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4 overflow-hidden"
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-red-600 dark:text-red-300/80">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="border-red-200 dark:border-red-900/50 bg-white dark:bg-red-950/30 text-red-700 dark:text-red-200 placeholder:text-red-300 dark:placeholder:text-red-900 rounded-xl font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || isPending}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 px-4 text-sm font-medium gap-1.5 disabled:opacity-40"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isPending ? "Deleting…" : "Confirm Delete"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                className="rounded-xl h-9 px-4 text-sm"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const NAV_TABS: { id: NavTab; label: string; icon: React.ReactNode }[] = [
  { id: "profile",       label: "Profile",       icon: <User className="w-4 h-4" /> },
  { id: "security",      label: "Security",      icon: <Shield className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
  { id: "danger",        label: "Danger Zone",   icon: <Trash2 className="w-4 h-4" /> },
];

const CreatorSettings = () => {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>("profile");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);

  const handleAvatarChange = (url: string | null) => {
    setAvatarUrl(url);
    // Refresh auth context so avatar_url propagates to other pages immediately
    refreshProfile();
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-1">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your creator account and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 items-start">
          {/* Left nav */}
          <nav className="lg:sticky lg:top-24 self-start">
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 space-y-1 shadow-sm">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    activeTab === tab.id
                      ? tab.id === "danger"
                        ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300"
                        : "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
                      : tab.id === "danger"
                      ? "text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Right content */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {activeTab === "profile" && (
                <ProfileTab avatarUrl={avatarUrl} onAvatarChange={handleAvatarChange} />
              )}
              {activeTab === "security" && <SecurityTab />}
              {activeTab === "notifications" && <NotificationsTab />}
              {activeTab === "danger" && <DangerTab />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CreatorSettings;
