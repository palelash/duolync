"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Bell, MessageSquare, CheckCheck, Check, X, UserCheck, Search, Sun, Moon, Settings } from "lucide-react";
import {
  markNotificationsReadAction,
  type NotificationItem,
} from "@/app/actions/notifications";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import {
  acceptConnectionAction,
  rejectConnectionAction,
} from "@/app/actions/connections";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";
import { useTheme } from "@/app/_components/theme/ThemeContext";
import type { ConversationSummary } from "@/app/actions/messages";

// ─── Mini avatar for conversation dropdown ────────────────────────────────────

function ConvAvatar({ conv }: { conv: ConversationSummary }) {
  const initials = conv.otherUserName
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
      {conv.otherUserAvatarUrl ? (
        <img src={conv.otherUserAvatarUrl} alt={conv.otherUserName} className="w-full h-full object-cover" />
      ) : (
        <div
          className={cn(
            "w-full h-full flex items-center justify-center text-[11px] font-bold text-white",
            conv.otherUserType === "brand"
              ? "bg-gradient-to-br from-violet-600 to-pink-600"
              : "bg-gradient-to-br from-violet-600 to-purple-600",
          )}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

// ─── Notification item ────────────────────────────────────────────────────────

function NotifItem({
  notif,
  onClose,
  onUpdate,
}: {
  notif: NotificationItem;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<NotificationItem>) => void;
}) {
  const [actionState, setActionState] = useState<"idle" | "loading" | "accepted" | "ignored">("idle");

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleAccept = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notif.connectionId) return;
    setActionState("loading");
    await acceptConnectionAction(notif.connectionId);
    setActionState("accepted");
    onUpdate(notif.id, { read: true, connectionId: null });
  };

  const handleIgnore = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notif.connectionId) return;
    setActionState("loading");
    await rejectConnectionAction(notif.connectionId);
    setActionState("ignored");
    onUpdate(notif.id, { read: true, connectionId: null });
  };

  // ── Connection request: rich interactive item ──────────────────────────────
  if (notif.type === "CONNECTION_REQUEST") {
    const initials = notif.title
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();

    return (
      <div
        className={cn(
          "flex items-start gap-3 px-4 py-3 transition-colors",
          !notif.read ? "bg-violet-500/[0.07]" : "hover:bg-white/[0.04]",
        )}
      >
        {/* Sender avatar */}
        <Link
          href={notif.senderUserId ? `/profile/${notif.senderUserId}` : "#"}
          onClick={onClose}
          className="shrink-0 mt-0.5"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-zinc-200 dark:ring-zinc-700 hover:ring-primary transition-all">
            {notif.senderAvatar ? (
              <img src={notif.senderAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                {initials.slice(0, 2)}
              </div>
            )}
          </div>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-[13px] leading-snug mb-1", !notif.read ? "font-semibold text-zinc-100" : "text-zinc-300")}>
            {notif.title}
          </p>

          {actionState === "accepted" ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <UserCheck className="w-3.5 h-3.5" /> Connected!
            </div>
          ) : actionState === "ignored" ? (
            <p className="text-xs text-zinc-500">Request ignored</p>
          ) : notif.connectionId ? (
            <div className="flex gap-2 mt-1.5">
              <button
                disabled={actionState === "loading"}
                onClick={handleAccept}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                <Check className="w-3 h-3" />
                Accept
              </button>
              <button
                disabled={actionState === "loading"}
                onClick={handleIgnore}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.06] text-zinc-300 text-xs font-medium hover:bg-white/[0.10] disabled:opacity-60 transition-colors border border-white/[0.08]"
              >
                <X className="w-3 h-3" />
                Ignore
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Request already handled</p>
          )}

          <p className="text-[10px] text-zinc-600 mt-1.5">{timeAgo(notif.createdAt)}</p>
        </div>

        {!notif.read && actionState === "idle" && (
          <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
        )}
      </div>
    );
  }

  // ── All other notification types: standard item ───────────────────────────
  const typeIcon: Record<string, string> = {
    APPLICATION_UPDATE: "📩",
    CAMPAIGN_UPDATE: "📢",
    PROPOSAL_RECEIVED: "📩",
    PROPOSAL_ACCEPTED: "✅",
    PROPOSAL_REJECTED: "❌",
    MESSAGE: "💬",
    CONNECTION_ACCEPTED: "🤝",
    SYSTEM: "🔔",
  };
  const icon = typeIcon[notif.type] ?? "🔔";

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 text-left w-full transition-colors",
        notif.read ? "hover:bg-white/[0.04]" : "bg-violet-500/[0.06] hover:bg-violet-500/[0.09]",
      )}
    >
      <span className="text-xl shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[13px] leading-snug", notif.read ? "text-zinc-400" : "font-semibold text-zinc-100")}>
          {notif.title}
        </p>
        {notif.body && (
          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{notif.body}</p>
        )}
        <p className="text-[10px] text-zinc-600 mt-1">{timeAgo(notif.createdAt)}</p>
      </div>
      {!notif.read && <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0 mt-1.5" />}
    </div>
  );

  if (notif.link) {
    return (
      <Link href={notif.link} onClick={onClose} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

// ─── Header ───────────────────────────────────────────────────────────────────

const AuthenticatedHeader = () => {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const { unreadCount, recentConversations, isUnread, openChatWindow } = useMessaging();
  const { theme, mounted, toggleTheme } = useTheme();

  const [showMsgDropdown, setShowMsgDropdown] = useState(false);
  const msgDropdownRef = useRef<HTMLDivElement>(null);

  // ── Notifications via SSE (replaces 30 s polling) ────────────────────────
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount: notifUnread,
    loading: notifLoading,
    refetch: refetchNotifications,
    patchNotification,
    markAllReadLocally,
  } = useNotificationStream();

  // Close on outside click — notifications
  useEffect(() => {
    if (!showNotifDropdown) return;
    const handler = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifDropdown]);

  const handleOpenNotifDropdown = async () => {
    setShowNotifDropdown((v) => !v);
    if (!showNotifDropdown && notifUnread > 0) {
      markAllReadLocally(); // instant optimistic update
      await markNotificationsReadAction();
      // SSE will confirm the DB change on next poll; no manual refetch needed
    }
  };

  // Optimistic patch for a single notification (called after Accept/Ignore)
  const handleNotifUpdate = useCallback(
    (id: string, patch: Partial<NotificationItem>) => {
      patchNotification(id, patch);
    },
    [patchNotification],
  );

  // Close on outside click — messages
  useEffect(() => {
    if (!showMsgDropdown) return;
    const handler = (e: MouseEvent) => {
      if (msgDropdownRef.current && !msgDropdownRef.current.contains(e.target as Node)) {
        setShowMsgDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMsgDropdown]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/auth");
  };

  const dashboardPath = profile?.user_type === "brand" ? "/brand/dashboard" : "/creator/dashboard";
  const isBrand = profile?.user_type === "brand";

  // Profile avatar helpers
  const avatarInitials = profile?.full_name
    ? profile.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "D";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl transition-colors duration-300">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href={dashboardPath} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl overflow-hidden shrink-0 shadow-lg shadow-violet-500/25">
              <img src="/duolync-logo.png" alt="Duolync" className="w-full h-full object-cover" />
            </div>
            <span
              className="font-display font-bold text-xl tracking-tight"
              style={{
                background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Duolync
            </span>
          </Link>

          {/* Role badge */}
          {profile && (
            <span
              className={cn(
                "hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border tracking-wide backdrop-blur-sm",
                isBrand
                  ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                  : "bg-violet-500/10 text-violet-400 border-violet-500/20",
              )}
            >
              {isBrand ? "Brand Account" : "Creator Account"}
            </span>
          )}

          {/* Right side */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* ⌘K search trigger — desktop only */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
              title="Search (⌘K)"
              className="hidden md:flex items-center gap-1.5 h-8 px-3 rounded-2xl text-xs font-medium text-zinc-400 border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.14] hover:text-zinc-200 hover:bg-white/[0.07] transition-all"
            >
              <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden lg:inline-flex items-center px-1 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[9px] font-mono text-zinc-500 ml-0.5">
                ⌘K
              </kbd>
            </button>
            {/* Messages — only shown when bottom nav is hidden (lg+) */}
            <div ref={msgDropdownRef} className="relative hidden lg:flex">
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-2xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]"
                onClick={() => setShowMsgDropdown((v) => !v)}
                title="Messages"
              >
                <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-gradient-to-r from-red-500 to-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>

              {showMsgDropdown && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <h3 className="font-semibold text-sm text-zinc-100">Messages</h3>
                    <Link href="/messages" className="text-xs text-violet-400 hover:text-violet-300 transition-colors" onClick={() => setShowMsgDropdown(false)}>
                      See all
                    </Link>
                  </div>
                  {recentConversations.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.04]">
                      {recentConversations.map((conv) => {
                        const unread = isUnread(conv.otherUserId);
                        return (
                          <button
                            key={conv.otherUserId}
                            onClick={() => { openChatWindow({ id: conv.otherUserId, full_name: conv.otherUserName, avatar_url: conv.otherUserAvatarUrl, user_type: conv.otherUserType }); setShowMsgDropdown(false); }}
                            className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", unread ? "bg-violet-500/[0.07] hover:bg-violet-500/10" : "hover:bg-white/[0.04]")}
                          >
                            <ConvAvatar conv={conv} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className={cn("text-[13px] truncate", unread ? "font-bold text-zinc-100" : "font-medium text-zinc-400")}>{conv.otherUserName}</span>
                                {unread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                              </div>
                              <p className={cn("text-xs truncate", unread ? "text-zinc-200" : "text-zinc-500")}>{conv.lastMessage ?? "No messages yet"}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-10 px-4 text-center">
                      <MessageSquare className="w-8 h-8 text-zinc-700 mb-2" strokeWidth={1.5} />
                      <p className="text-sm text-zinc-500">No conversations yet</p>
                      <Link href="/messages" className="mt-2 text-xs text-violet-400 hover:text-violet-300 underline" onClick={() => setShowMsgDropdown(false)}>
                        Start a chat
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div ref={notifDropdownRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-2xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]"
                onClick={handleOpenNotifDropdown}
                title="Notifications"
              >
                <Bell className="h-4 w-4" strokeWidth={1.5} />
                {notifUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-gradient-to-r from-red-500 to-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                    {notifUnread > 9 ? "9+" : notifUnread}
                  </span>
                )}
              </Button>

              {showNotifDropdown && (
                <div className="
                  max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.25rem]
                  sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:w-[22rem]
                  bg-zinc-900/95 backdrop-blur-xl
                  border border-white/[0.08]
                  rounded-2xl shadow-2xl shadow-black/40
                  z-[9999] overflow-hidden
                  flex flex-col
                  max-sm:max-h-[calc(100svh-5.5rem)]
                  sm:max-h-[min(32rem,calc(100vh-5rem))]
                ">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
                    <h3 className="font-semibold text-sm text-zinc-100">Notifications</h3>
                    {notifications.some((n) => !n.read) && (
                      <button
                        onClick={async () => {
                          markAllReadLocally();
                          await markNotificationsReadAction();
                        }}
                        className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notifLoading && notifications.length === 0 ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : notifications.length > 0 ? (
                    <>
                      <div className="overflow-y-auto divide-y divide-white/[0.04] flex-1 min-h-0">
                        {notifications.slice(0, 10).map((notif) => (
                          <NotifItem
                            key={notif.id}
                            notif={notif}
                            onClose={() => setShowNotifDropdown(false)}
                            onUpdate={handleNotifUpdate}
                          />
                        ))}
                      </div>
                      {notifications.length > 10 && (
                        <div className="border-t border-white/[0.06] px-4 py-2.5 text-center shrink-0">
                          <span className="text-xs text-zinc-500">
                            Showing 10 of {notifications.length} notifications
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center py-10 px-4 text-center">
                      <Bell className="w-8 h-8 text-zinc-700 mb-2" strokeWidth={1.5} />
                      <p className="text-sm text-zinc-500">No notifications yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Profile Dropdown (LinkedIn-style) ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-2xl px-1.5 py-1 hover:bg-white/[0.06] transition-colors outline-none">
                  <Avatar className="h-8 w-8 ring-2 ring-white/10 hover:ring-violet-500/50 transition-all">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || ""} />
                    <AvatarFallback className="gradient-primary text-white text-xs font-bold">
                      {avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium leading-none max-w-[100px] truncate text-zinc-200">
                    {profile?.full_name?.split(" ")[0] ?? "Account"}
                  </span>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-64 bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40" align="end" forceMount>
                {/* ── Profile block ── */}
                <Link
                  href={profile ? `/profile/${profile.id}` : "#"}
                  className="flex items-center gap-3 px-3 py-3 hover:bg-white/[0.05] transition-colors rounded-t-xl"
                >
                  <Avatar className="h-11 w-11 shrink-0 ring-2 ring-white/10">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || ""} />
                    <AvatarFallback className="gradient-primary text-white text-sm font-bold">
                      {avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate text-zinc-100">
                      {profile?.full_name ?? "User"}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      View your profile →
                    </p>
                  </div>
                </Link>

                <DropdownMenuSeparator className="bg-white/[0.06]" />

                <DropdownMenuItem asChild className="cursor-pointer text-zinc-300 hover:text-zinc-100 focus:bg-white/[0.05]">
                  <Link href={profile?.user_type === "brand" ? "/brand/settings" : "/creator/settings"} className="flex items-center gap-2">
                    <Settings className="h-4 w-4" strokeWidth={1.5} />
                    Settings
                  </Link>
                </DropdownMenuItem>

                {/* ── Theme toggle ── */}
                {mounted && (
                  <DropdownMenuItem
                    onClick={(e) => { e.preventDefault(); toggleTheme(); }}
                    className="flex items-center justify-between cursor-pointer text-zinc-300 hover:text-zinc-100 focus:bg-white/[0.05]"
                  >
                    <div className="flex items-center gap-2">
                      {theme === "dark" ? (
                        <Sun className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
                      ) : (
                        <Moon className="h-4 w-4 text-violet-400" strokeWidth={1.5} />
                      )}
                      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                    </div>
                    <div className="relative w-8 h-4.5 shrink-0">
                      <div className={cn(
                        "w-8 h-4 rounded-full transition-colors duration-200",
                        theme === "dark" ? "bg-violet-500/30" : "bg-zinc-700"
                      )} />
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 rounded-full shadow-sm transition-all duration-200",
                        theme === "dark"
                          ? "translate-x-4 bg-violet-400"
                          : "translate-x-0.5 bg-zinc-400"
                      )} />
                    </div>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="bg-white/[0.06]" />

                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="cursor-pointer text-red-400 focus:text-red-300 focus:bg-red-500/10"
                >
                  <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
    </header>
  );
};

export default AuthenticatedHeader;
