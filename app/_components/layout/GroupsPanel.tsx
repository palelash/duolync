"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users, Plus, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useMessaging } from "@/app/_components/messaging/MessagingContext";
import {
  getCommunityListsAction,
  createCommunityListAction,
  type CommunityListWithCount,
} from "@/app/actions/communities";
import { getPendingApplicationsCountAction } from "@/app/actions/brand-applications";
import { getPendingInvitationsCountAction } from "@/app/actions/invitations";
import { cn } from "@/lib/utils";
import { BRAND_NAV_ITEMS, CREATOR_NAV_ITEMS } from "./nav-config";

const GroupsPanel = () => {
  const { profile } = useAuth();
  const { unreadCount } = useMessaging();
  const pathname = usePathname();
  const isBrand = profile?.user_type === "brand";

  const [communityLists, setCommunityLists] = useState<CommunityListWithCount[]>([]);
  const [newListName, setNewListName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [pendingInvitations, setPendingInvitations] = useState(0);

  useEffect(() => {
    getCommunityListsAction().then((res) => {
      if (!res.error) setCommunityLists(res.data);
    });
    if (isBrand) {
      getPendingApplicationsCountAction()
        .then((res) => setPendingApplications(res.count))
        .catch(() => setPendingApplications(0));
    } else {
      getPendingInvitationsCountAction()
        .then((res) => setPendingInvitations(res.count))
        .catch(() => setPendingInvitations(0));
    }
  }, [isBrand]);

  const handleCreate = async () => {
    if (!newListName.trim()) return;
    setCreating(true);
    const res = await createCommunityListAction(newListName);
    setCreating(false);
    if (!res.error && res.data) {
      setCommunityLists((prev) => [...prev, res.data!]);
      setNewListName("");
      setShowInput(false);
    }
  };

  const mainNavItems = isBrand ? BRAND_NAV_ITEMS : CREATOR_NAV_ITEMS;

  return (
    <aside className="hidden lg:flex w-64 shrink-0 sticky top-16 self-start h-[calc(100vh-4rem)] flex-col border-r border-white/[0.06] bg-zinc-950/60 backdrop-blur-xl transition-colors duration-300">
      <ScrollArea className="flex-1 p-3">
        {/* Main Navigation */}
        <nav className="space-y-0.5 mb-6 mt-2">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
            const isMessages = item.label === "Messages";
            const isCampaigns = item.label === "Campaigns" && isBrand;
            const isInvitations = item.label === "Invitations" && !isBrand;
            const hasUnreadMsg = isMessages && unreadCount > 0;
            const hasPendingApps = isCampaigns && pendingApplications > 0;
            const hasPendingInvites = isInvitations && pendingInvitations > 0;
            const hasBadge = hasUnreadMsg || hasPendingApps || hasPendingInvites;
            const badgeCount = isMessages ? unreadCount : isCampaigns ? pendingApplications : pendingInvitations;
            const activeClass = isBrand
              ? "bg-gradient-to-r from-violet-500/20 to-pink-500/10 text-violet-300 border border-violet-500/25 shadow-sm shadow-violet-500/10"
              : "bg-gradient-to-r from-violet-500/20 to-pink-500/10 text-violet-300 border border-violet-500/25 shadow-sm shadow-violet-500/10";
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-sm",
                  isActive
                    ? activeClass
                    : [
                        "hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent",
                        hasBadge
                          ? "font-semibold text-zinc-200"
                          : "font-medium text-zinc-400",
                      ],
                )}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 truncate">{item.label}</span>
                {hasBadge && !isActive && (
                  <span className="min-w-[18px] h-[18px] bg-gradient-to-r from-red-500 to-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1 leading-none shrink-0">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* My Communities (brand only) */}
        {isBrand && (
          <div className="border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-semibold text-[11px] text-zinc-500 uppercase tracking-widest">
                My Communities
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]"
                onClick={() => setShowInput((v) => !v)}
                title="New list"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>

            {showInput && (
              <div className="mb-2 flex gap-1.5">
                <input
                  autoFocus
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setShowInput(false); setNewListName(""); }
                  }}
                  placeholder="List name…"
                  maxLength={60}
                  className="flex-1 text-xs px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none transition-colors"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newListName.trim()}
                  className="text-xs px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold disabled:opacity-50 transition-opacity"
                >
                  {creating ? "…" : "Add"}
                </button>
              </div>
            )}

            {communityLists.length > 0 ? (
              <div className="space-y-0.5">
                {communityLists.map((list) => (
                  <Link
                    key={list.id}
                    href="/community"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors border border-transparent"
                  >
                    <div className="w-7 h-7 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                      <FolderOpen className="w-3.5 h-3.5 text-violet-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-xs">{list.name}</div>
                      <div className="text-[10px] text-zinc-600">
                        {list.memberCount} creator{list.memberCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <Users className="w-7 h-7 text-zinc-700 mx-auto mb-1.5" strokeWidth={1.5} />
                <p className="text-xs text-zinc-600">No lists yet</p>
                <Button
                  variant="link"
                  size="sm"
                  className="text-violet-400 text-xs hover:text-violet-300"
                  onClick={() => setShowInput(true)}
                >
                  Create a list
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};

export default GroupsPanel;
